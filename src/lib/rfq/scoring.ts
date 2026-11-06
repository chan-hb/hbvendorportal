import type { Bid, BidLine, Rfq } from "@prisma/client";

/**
 * Deterministic bid scoring.
 *
 * Four criteria, equally weighted by default: price, lead time, capacity and
 * minimum order quantity. Each weight is adjustable per RFQ, and setting one to
 * zero removes it from the calculation entirely.
 *
 * Capacity is judged against both quantities Purchasing enters. Launch is the
 * volume being committed to now, full year is what the relationship is worth,
 * and a supplier who can cover the launch but not the year is a different
 * proposition from one who can do both.
 *
 * Not a language model. A buyer has to defend an award to the supplier who
 * lost, so every number is reproducible and the breakdown is on screen.
 */

export type BidWithLines = Bid & { lines: BidLine[]; vendor: { id: string; name: string; code: string } };

export type ScoreComponent = {
  key: "price" | "leadTime" | "capacity" | "moq";
  label: string;
  raw: string;
  score: number;
  weight: number;
  contribution: number;
  note: string;
};

export type BidMetrics = {
  /** Price at the launch quantity, or the nearest break at or below it. */
  referencePrice: number;
  referenceTier: number | null;
  /** Price at the full year quantity, for the volume conversation. */
  fullYearPrice: number | null;
  fullYearTier: number | null;
  tiers: { quantity: number; unitPrice: number }[];
  /** How long a first sample takes. Shown to buyers, deliberately not scored. */
  samplingLeadTimeDays: number | null;
  leadTimeDays: number | null;
  weeklyCapacity: number | null;
  /** Lead time plus production time for the launch volume, in days. */
  daysToLaunch: number | null;
  /** Weeks of production the full year volume would take at the stated rate. */
  weeksForFullYear: number | null;
  /** Whether a year's volume is achievable inside a year at that rate. */
  coversFullYear: boolean | null;
  moq: number | null;
  moqAboveLaunch: boolean;
  paymentTermsDays: number | null;
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

const WEEKS_PER_YEAR = 52;

export function computeMetrics(
  bid: Pick<Bid, "samplingLeadTimeDays" | "leadTimeDays" | "weeklyCapacity" | "moq" | "paymentTermsDays">,
  lines: Pick<BidLine, "quantity" | "unitPrice">[],
  rfq: Pick<Rfq, "launchQuantity" | "fullYearQuantity">,
): BidMetrics {
  const launch = Number(rfq.launchQuantity) || 0;
  const fullYear = Number(rfq.fullYearQuantity) || 0;

  const tiers = lines
    .map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
    .filter((t) => t.quantity > 0 && t.unitPrice > 0)
    .sort((a, b) => a.quantity - b.quantity);

  const breakFor = (volume: number) => {
    const atOrBelow = tiers.filter((t) => t.quantity <= volume);
    return atOrBelow.length ? atOrBelow[atOrBelow.length - 1] : tiers[0];
  };

  const launchBreak = launch > 0 ? breakFor(launch) : tiers[0];
  const yearBreak = fullYear > 0 ? breakFor(fullYear) : undefined;

  const samplingLeadTimeDays = bid.samplingLeadTimeDays ?? null;
  const leadTimeDays = bid.leadTimeDays ?? null;
  const weeklyCapacity = bid.weeklyCapacity ? Number(bid.weeklyCapacity) : null;

  const weeksForLaunch = weeklyCapacity && weeklyCapacity > 0 ? launch / weeklyCapacity : null;
  const daysToLaunch =
    leadTimeDays !== null && weeksForLaunch !== null ? leadTimeDays + weeksForLaunch * 7 : leadTimeDays;

  const weeksForFullYear = weeklyCapacity && weeklyCapacity > 0 ? fullYear / weeklyCapacity : null;
  const moq = bid.moq ? Number(bid.moq) : null;

  return {
    referencePrice: launchBreak?.unitPrice ?? 0,
    referenceTier: launchBreak?.quantity ?? null,
    fullYearPrice: yearBreak?.unitPrice ?? null,
    fullYearTier: yearBreak?.quantity ?? null,
    tiers,
    samplingLeadTimeDays,
    leadTimeDays,
    weeklyCapacity,
    daysToLaunch,
    weeksForFullYear,
    coversFullYear: weeksForFullYear === null ? null : weeksForFullYear <= WEEKS_PER_YEAR,
    moq,
    moqAboveLaunch: moq !== null && launch > 0 && moq > launch,
    paymentTermsDays: bid.paymentTermsDays ?? null,
  };
}

export function scoreBids(rfq: Rfq, bids: BidWithLines[]): BidScore[] {
  const weights = normaliseWeights(rfq);
  const metricsByBid = new Map(bids.map((b) => [b.id, computeMetrics(b, b.lines, rfq)]));
  const all = [...metricsByBid.values()];

  // Everything is relative to the best offer in this RFQ. There is no
  // meaningful absolute scale for price or lead time across different items.
  const bestPrice = min(all.map((m) => m.referencePrice).filter((n) => n > 0));
  const bestLead = min(all.map((m) => m.leadTimeDays).filter((n): n is number => n !== null && n > 0));
  const bestDays = min(all.map((m) => m.daysToLaunch).filter((n): n is number => n !== null && n > 0));
  const bestMoq = min(all.map((m) => m.moq).filter((n): n is number => n !== null && n > 0));

  const launch = Number(rfq.launchQuantity) || 0;
  const fullYear = Number(rfq.fullYearQuantity) || 0;

  return bids
    .map((bid) => {
      const m = metricsByBid.get(bid.id)!;
      const warnings: string[] = [];

      const priceScore = bestPrice && m.referencePrice > 0 ? bestPrice / m.referencePrice : 0;

      // An unstated figure scores zero rather than being ignored, otherwise
      // leaving a field blank would be an advantage.
      const leadScore = bestLead && m.leadTimeDays ? bestLead / m.leadTimeDays : 0;
      if (m.leadTimeDays === null) warnings.push("No lead time given");

      // Capacity covers both volumes: how quickly the launch can be supplied,
      // and whether a year's worth is achievable inside a year.
      const launchSpeed = bestDays && m.daysToLaunch ? bestDays / m.daysToLaunch : 0;
      const yearCoverage =
        m.weeksForFullYear === null ? 0 : Math.min(1, WEEKS_PER_YEAR / Math.max(m.weeksForFullYear, 0.0001));
      const capacityScore = 0.5 * launchSpeed + 0.5 * yearCoverage;

      if (m.weeklyCapacity === null) warnings.push("No weekly capacity given");
      if (m.coversFullYear === false) {
        warnings.push(
          `At ${m.weeklyCapacity?.toLocaleString()} a week they would need ${Math.ceil(
            m.weeksForFullYear ?? 0,
          )} weeks for the full year volume`,
        );
      }

      // A lower minimum order is more flexible, so it scores higher.
      const moqScore = m.moq === null ? 0 : bestMoq ? Math.min(1, bestMoq / m.moq) : 1;
      if (m.moq === null) warnings.push("No minimum order quantity given");
      if (m.moqAboveLaunch) warnings.push("Minimum order exceeds the launch quantity");
      if (m.tiers.length === 0) warnings.push("No prices quoted");

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
            : "No price break covers the launch volume",
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
          raw: m.weeklyCapacity !== null ? `${m.weeklyCapacity.toLocaleString()} per week` : "Not stated",
          score: clamp(capacityScore),
          weight: weights.capacity,
          contribution: clamp(capacityScore) * weights.capacity,
          note:
            m.daysToLaunch === null
              ? "Cannot be assessed without capacity and lead time"
              : `About ${Math.ceil(m.daysToLaunch)} days to supply ${launch.toLocaleString()}` +
                (m.weeksForFullYear !== null
                  ? `, and ${Math.ceil(m.weeksForFullYear)} weeks of production for ${fullYear.toLocaleString()}`
                  : ""),
        },
        {
          key: "moq",
          label: "Minimum order",
          raw: m.moq !== null ? m.moq.toLocaleString() : "Not stated",
          score: clamp(moqScore),
          weight: weights.moq,
          contribution: clamp(moqScore) * weights.moq,
          note:
            m.moq === null
              ? "Nothing quoted, so this scores zero"
              : m.moqAboveLaunch
                ? "Above the launch quantity, so a first order would have to be larger than planned"
                : bestMoq && m.moq > bestMoq
                  ? `${(m.moq / bestMoq).toFixed(1)} times the lowest minimum quoted`
                  : "Lowest minimum order quoted",
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
    moq: rfq.weightMoq,
  };
  const sum = raw.price + raw.leadTime + raw.capacity + raw.moq || 1;
  return {
    price: raw.price / sum,
    leadTime: raw.leadTime / sum,
    capacity: raw.capacity / sum,
    moq: raw.moq / sum,
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
      : "with no price break covering the launch volume",
    winner.metrics.leadTimeDays !== null ? `a ${winner.metrics.leadTimeDays} day lead time` : "no stated lead time",
    winner.metrics.weeklyCapacity !== null
      ? `and ${winner.metrics.weeklyCapacity.toLocaleString()} a week of capacity`
      : "and no stated capacity",
  ];

  const gap = runnerUp ? `, ahead of ${runnerUp.vendorName} on ${runnerUp.total}` : "";
  const caveat = winner.warnings.length ? ` Note: ${winner.warnings.join("; ").toLowerCase()}.` : "";
  return `${parts.join(", ")}${gap}.${caveat}`;
}
