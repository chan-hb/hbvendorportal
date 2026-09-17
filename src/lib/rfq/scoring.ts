import type { Bid, BidLine, Rfq } from "@prisma/client";

/**
 * Deterministic bid scoring.
 *
 * Timing used to be assessed from delivery dates on each line. Quotations are
 * now priced by quantity break instead, so timing comes from what the supplier
 * states about their operation: lead time and weekly capacity. That is a better
 * question to ask anyway, because a date is a promise about one order whereas
 * capacity tells you whether they can keep supplying.
 *
 * Not a language model. A buyer has to defend an award to the supplier who
 * lost, so every number is reproducible and the breakdown is on screen.
 */

export type BidWithLines = Bid & { lines: BidLine[]; vendor: { id: string; name: string; code: string } };

export type VendorHistory = { participated: number; won: number };

export type ScoreComponent = {
  key: "price" | "leadTime" | "capacity" | "reliability";
  label: string;
  raw: string;
  score: number;
  weight: number;
  contribution: number;
  note: string;
};

export type BidMetrics = {
  /** Price at the target quantity, or the nearest tier at or below it. */
  referencePrice: number;
  referenceTier: number | null;
  tiers: { quantity: number; unitPrice: number }[];
  cheapestTierPrice: number;
  leadTimeDays: number | null;
  weeklyCapacity: number | null;
  /** Weeks of production to make the target quantity at the stated rate. */
  weeksToProduce: number | null;
  /** Lead time plus production, in days. The number that matters. */
  totalDaysToFull: number | null;
  moq: number | null;
  moqAboveTarget: boolean;
  paymentTerms: string | null;
};

export type BidScore = {
  bidId: string;
  vendorId: string;
  vendorName: string;
  total: number;
  components: ScoreComponent[];
  metrics: BidMetrics;
  disqualified: string | null;
  warnings: string[];
};

export function computeMetrics(
  bid: Pick<Bid, "leadTimeDays" | "weeklyCapacity" | "moq" | "paymentTerms">,
  lines: Pick<BidLine, "quantity" | "unitPrice">[],
  rfq: Pick<Rfq, "targetQuantity">,
): BidMetrics {
  const target = Number(rfq.targetQuantity) || 0;

  const tiers = lines
    .map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
    .filter((t) => t.quantity > 0 && t.unitPrice > 0)
    .sort((a, b) => a.quantity - b.quantity);

  // The price a buyer would actually pay: the break at or below the volume
  // they intend to buy. Falls back to the smallest tier quoted.
  const atOrBelow = tiers.filter((t) => t.quantity <= target);
  const reference = atOrBelow.length ? atOrBelow[atOrBelow.length - 1] : tiers[0];

  const leadTimeDays = bid.leadTimeDays ?? null;
  const weeklyCapacity = bid.weeklyCapacity ? Number(bid.weeklyCapacity) : null;
  const weeksToProduce = weeklyCapacity && weeklyCapacity > 0 ? target / weeklyCapacity : null;
  const totalDaysToFull =
    leadTimeDays !== null && weeksToProduce !== null
      ? leadTimeDays + weeksToProduce * 7
      : leadTimeDays;

  const moq = bid.moq ? Number(bid.moq) : null;

  return {
    referencePrice: reference?.unitPrice ?? 0,
    referenceTier: reference?.quantity ?? null,
    tiers,
    cheapestTierPrice: tiers.length ? Math.min(...tiers.map((t) => t.unitPrice)) : 0,
    leadTimeDays,
    weeklyCapacity,
    weeksToProduce,
    totalDaysToFull,
    moq,
    moqAboveTarget: moq !== null && target > 0 && moq > target,
    paymentTerms: bid.paymentTerms ?? null,
  };
}

export function reliabilityScore(history: VendorHistory): number {
  // Laplace smoothing, so one win from one bid does not outrank eight from ten.
  // No history lands at 0.5, deliberately neutral: a new supplier has to be
  // able to win their first RFQ.
  return (history.won + 1) / (history.participated + 2);
}

export function scoreBids(rfq: Rfq, bids: BidWithLines[], history: Map<string, VendorHistory>): BidScore[] {
  const weights = normaliseWeights(rfq);
  const metricsByBid = new Map(bids.map((b) => [b.id, computeMetrics(b, b.lines, rfq)]));
  const all = [...metricsByBid.values()];

  // Everything is scored relative to the best offer in this RFQ. There is no
  // meaningful absolute scale for price or lead time across different items.
  const bestPrice = min(all.map((m) => m.referencePrice).filter((n) => n > 0));
  const bestLead = min(all.map((m) => m.leadTimeDays).filter((n): n is number => n !== null && n > 0));
  const bestDays = min(all.map((m) => m.totalDaysToFull).filter((n): n is number => n !== null && n > 0));

  return bids
    .map((bid) => {
      const m = metricsByBid.get(bid.id)!;
      const h = history.get(bid.vendorId) ?? { participated: 0, won: 0 };
      const warnings: string[] = [];

      const priceScore = bestPrice && m.referencePrice > 0 ? bestPrice / m.referencePrice : 0;

      // An unstated lead time scores zero rather than being ignored, otherwise
      // leaving the field blank would be an advantage.
      const leadScore = bestLead && m.leadTimeDays ? bestLead / m.leadTimeDays : 0;
      if (m.leadTimeDays === null) warnings.push("No lead time given");

      const capacityScore = bestDays && m.totalDaysToFull ? bestDays / m.totalDaysToFull : 0;
      if (m.weeklyCapacity === null) warnings.push("No weekly capacity given");
      if (m.moqAboveTarget) warnings.push(`Minimum order of ${m.moq?.toLocaleString()} exceeds the quantity sought`);
      if (m.tiers.length === 0) warnings.push("No prices quoted");

      const relScore = reliabilityScore(h);

      const components: ScoreComponent[] = [
        {
          key: "price",
          label: "Price",
          raw: m.referencePrice ? m.referencePrice.toFixed(4) : "Not quoted",
          score: clamp(priceScore),
          weight: weights.price,
          contribution: clamp(priceScore) * weights.price,
          note: m.referenceTier
            ? bestPrice && m.referencePrice > bestPrice
              ? `At the ${m.referenceTier.toLocaleString()} break, ${(((m.referencePrice - bestPrice) / bestPrice) * 100).toFixed(1)} percent above the best offer`
              : `Best price at the ${m.referenceTier.toLocaleString()} break`
            : "No price break covers this volume",
        },
        {
          key: "leadTime",
          label: "Lead time",
          raw: m.leadTimeDays !== null ? `${m.leadTimeDays} days` : "Not stated",
          score: clamp(leadScore),
          weight: weights.leadTime,
          contribution: clamp(leadScore) * weights.leadTime,
          note:
            m.leadTimeDays === null
              ? "Nothing quoted, so this scores zero"
              : bestLead && m.leadTimeDays > bestLead
                ? `${m.leadTimeDays - bestLead} days longer than the quickest`
                : "Quickest lead time quoted",
        },
        {
          key: "capacity",
          label: "Capacity",
          raw:
            m.weeklyCapacity !== null
              ? `${m.weeklyCapacity.toLocaleString()} per week`
              : "Not stated",
          score: clamp(capacityScore),
          weight: weights.capacity,
          contribution: clamp(capacityScore) * weights.capacity,
          note:
            m.totalDaysToFull === null
              ? "Cannot be assessed without capacity and lead time"
              : `About ${Math.ceil(m.totalDaysToFull)} days to supply the full quantity, including lead time`,
        },
        {
          key: "reliability",
          label: "Track record",
          raw: `${h.won} of ${h.participated} previous RFQs`,
          score: clamp(relScore),
          weight: weights.reliability,
          contribution: clamp(relScore) * weights.reliability,
          note:
            h.participated === 0
              ? "No history yet, scored neutrally"
              : `${((h.won / h.participated) * 100).toFixed(0)} percent win rate, smoothed`,
        },
      ];

      return {
        bidId: bid.id,
        vendorId: bid.vendorId,
        vendorName: bid.vendor.name,
        total: Math.round(components.reduce((s, c) => s + c.contribution, 0) * 1000) / 10,
        components,
        metrics: m,
        disqualified: m.tiers.length === 0 ? "No prices quoted" : null,
        warnings,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function normaliseWeights(rfq: Rfq) {
  const raw = {
    price: rfq.weightPrice,
    leadTime: rfq.weightLeadTime,
    capacity: rfq.weightCapacity,
    reliability: rfq.weightReliability,
  };
  const sum = raw.price + raw.leadTime + raw.capacity + raw.reliability || 1;
  return {
    price: raw.price / sum,
    leadTime: raw.leadTime / sum,
    capacity: raw.capacity / sum,
    reliability: raw.reliability / sum,
  };
}

const min = (ns: number[]) => (ns.length ? Math.min(...ns) : 0);
const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function explainWinner(scores: BidScore[], currency: string): string {
  const [winner, runnerUp] = scores;
  if (!winner) return "No bids to compare.";

  const parts = [
    `${winner.vendorName} scores ${winner.total} of 100`,
    winner.metrics.referenceTier
      ? `at ${currency} ${winner.metrics.referencePrice.toFixed(4)} for the ${winner.metrics.referenceTier.toLocaleString()} break`
      : "with no price break covering this volume",
    winner.metrics.leadTimeDays !== null
      ? `a ${winner.metrics.leadTimeDays} day lead time`
      : "no stated lead time",
    winner.metrics.weeklyCapacity !== null
      ? `and ${winner.metrics.weeklyCapacity.toLocaleString()} a week of capacity`
      : "and no stated capacity",
  ];

  const gap = runnerUp ? `, ahead of ${runnerUp.vendorName} on ${runnerUp.total}` : "";
  const caveat = winner.warnings.length ? ` Note: ${winner.warnings.join("; ").toLowerCase()}.` : "";
  return `${parts.join(", ")}${gap}.${caveat}`;
}

/** Side-by-side price at every tier any supplier quoted. */
export function tierMatrix(scores: BidScore[]): { tiers: number[]; rows: { vendorName: string; prices: (number | null)[] }[] } {
  const tiers = Array.from(new Set(scores.flatMap((s) => s.metrics.tiers.map((t) => t.quantity)))).sort(
    (a, b) => a - b,
  );
  const rows = scores.map((s) => ({
    vendorName: s.vendorName,
    prices: tiers.map((t) => s.metrics.tiers.find((x) => x.quantity === t)?.unitPrice ?? null),
  }));
  return { tiers, rows };
}
