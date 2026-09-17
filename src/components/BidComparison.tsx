"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { awardRfqAction } from "@/app/actions/rfq";
import type { ActionState } from "@/app/actions/agreements";

type Score = {
  bidId: string;
  vendorId: string;
  vendorName: string;
  total: number;
  disqualified: string | null;
  warnings: string[];
  components: { key: string; label: string; raw: string; score: number; weight: number; contribution: number; note: string }[];
  metrics: {
    referencePrice: number;
    referenceTier: number | null;
    tiers: { quantity: number; unitPrice: number }[];
    leadTimeDays: number | null;
    weeklyCapacity: number | null;
    weeksToProduce: number | null;
    totalDaysToFull: number | null;
    moq: number | null;
    moqAboveTarget: boolean;
    paymentTerms: string | null;
  };
};

type BidRow = {
  id: string;
  vendorName: string;
  notes: string | null;
  quotationDate: string | null;
  validUntil: string | null;
  incoterm: string | null;
};

export function BidComparison({
  rfqId,
  currency,
  unit,
  targetQuantity,
  scores,
  bids,
  recommendation,
  canAward,
  awardedBidId,
}: {
  rfqId: string;
  currency: string;
  unit?: string | null;
  targetQuantity: number;
  scores: Score[];
  bids: BidRow[];
  recommendation: string;
  canAward: boolean;
  awardedBidId?: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(awardRfqAction, null);
  const [selected, setSelected] = useState<string>(awardedBidId ?? scores[0]?.bidId ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (scores.length === 0) {
    return <p className="px-5 py-10 text-sm text-charcoal/60">No quotations have been submitted yet.</p>;
  }

  const best = scores[0];
  const allTiers = Array.from(new Set(scores.flatMap((s) => s.metrics.tiers.map((t) => t.quantity)))).sort(
    (a, b) => a - b,
  );
  const bestAtTier = new Map(
    allTiers.map((t) => {
      const prices = scores
        .map((s) => s.metrics.tiers.find((x) => x.quantity === t)?.unitPrice)
        .filter((p): p is number => p !== undefined);
      return [t, prices.length ? Math.min(...prices) : null];
    }),
  );

  return (
    <div className="space-y-8 p-5">
      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
      ) : null}

      <section className="border border-pink/40 bg-pink-50 p-5">
        <p className="eyebrow">Suggested award</p>
        <p className="mt-2 font-display text-2xl uppercase tracking-tight text-charcoal">{best.vendorName}</p>
        <p className="mt-2 text-sm leading-relaxed text-charcoal/80">{recommendation}</p>
        <p className="mt-3 text-xs text-charcoal/60">
          A weighted score across price, lead time, capacity and past RFQ results, using the weights set on this
          RFQ. A starting point for a buyer, not a decision.
        </p>
      </section>

      {/* Price by quantity, side by side. The question a buyer actually asks. */}
      <section>
        <p className="eyebrow">Price at each quantity break</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Vendor</th>
                {allTiers.map((t) => (
                  <th key={t} className="th text-right">
                    {t.toLocaleString()}
                    {t === scores[0]?.metrics.referenceTier ? (
                      <span className="block text-[9px] text-pink">compared here</span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => (
                <tr key={s.bidId} className="border-b border-line/60 last:border-0">
                  <td className="td font-medium">{s.vendorName}</td>
                  {allTiers.map((t) => {
                    const price = s.metrics.tiers.find((x) => x.quantity === t)?.unitPrice;
                    const isBest = price !== undefined && price === bestAtTier.get(t);
                    return (
                      <td
                        key={t}
                        className={`td text-right whitespace-nowrap ${isBest ? "font-semibold text-[#2C6B44]" : ""}`}
                      >
                        {price !== undefined ? price.toFixed(4) : <span className="text-charcoal/35">Not offered</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-charcoal/55">
          Prices in {currency}. Green is the lowest offer at that volume.
        </p>
      </section>

      <section>
        <p className="eyebrow">Overall</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Rank</th>
                <th className="th">Vendor</th>
                <th className="th">Score</th>
                <th className="th">Compared price</th>
                <th className="th">Value at {targetQuantity.toLocaleString()}</th>
                <th className="th">Lead time</th>
                <th className="th">Weekly capacity</th>
                <th className="th">Time to full</th>
                <th className="th">MOQ</th>
                <th className="th">Payment terms</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s, i) => (
                <>
                  <tr
                    key={s.bidId}
                    className={`border-b border-line/60 ${
                      s.bidId === awardedBidId ? "bg-[#EAF4EE]" : i === 0 ? "bg-pink-50/50" : ""
                    }`}
                  >
                    <td className="td font-display text-lg">{i + 1}</td>
                    <td className="td">
                      <span className="font-medium">{s.vendorName}</span>
                      {s.bidId === awardedBidId ? (
                        <span className="ml-2 badge border-[#2C6B44]/25 bg-[#EAF4EE] text-[#2C6B44]">Awarded</span>
                      ) : null}
                      {s.warnings.map((w) => (
                        <span key={w} className="block text-xs text-nude">{w}</span>
                      ))}
                    </td>
                    <td className="td">
                      <span className="font-display text-xl">{s.total}</span>
                      <span className="text-xs text-charcoal/50"> / 100</span>
                    </td>
                    <td className="td whitespace-nowrap">
                      {s.metrics.referencePrice ? `${currency} ${s.metrics.referencePrice.toFixed(4)}` : "-"}
                      {s.metrics.referenceTier ? (
                        <span className="block text-xs text-charcoal/55">
                          at {s.metrics.referenceTier.toLocaleString()}
                        </span>
                      ) : null}
                    </td>
                    <td className="td whitespace-nowrap">
                      {s.metrics.referencePrice
                        ? `${currency} ${(s.metrics.referencePrice * targetQuantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                        : "-"}
                    </td>
                    <td className="td whitespace-nowrap">
                      {s.metrics.leadTimeDays !== null ? `${s.metrics.leadTimeDays} days` : <span className="text-nude">Not stated</span>}
                    </td>
                    <td className="td whitespace-nowrap">
                      {s.metrics.weeklyCapacity !== null
                        ? `${s.metrics.weeklyCapacity.toLocaleString()} ${unit ?? ""}`
                        : <span className="text-nude">Not stated</span>}
                    </td>
                    <td className="td whitespace-nowrap">
                      {s.metrics.totalDaysToFull !== null ? `${Math.ceil(s.metrics.totalDaysToFull)} days` : "-"}
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className={s.metrics.moqAboveTarget ? "text-nude" : ""}>
                        {s.metrics.moq !== null ? s.metrics.moq.toLocaleString() : "-"}
                      </span>
                    </td>
                    <td className="td text-sm">{s.metrics.paymentTerms ?? "-"}</td>
                    <td className="td">
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === s.bidId ? null : s.bidId)}
                        className="text-xs font-bold uppercase tracking-[0.1em] text-pink hover:underline"
                      >
                        {expanded === s.bidId ? "Hide" : "Why"}
                      </button>
                    </td>
                  </tr>

                  {expanded === s.bidId ? (
                    <tr key={`${s.bidId}-detail`} className="border-b border-line/60 bg-cloud/40">
                      <td className="td" colSpan={11}>
                        <p className="field-label">How the score was reached</p>
                        <table className="w-full max-w-2xl border-collapse text-sm">
                          <tbody>
                            {s.components.map((c) => (
                              <tr key={c.key} className="border-t border-line/60">
                                <td className="py-1.5 pr-3 font-medium">{c.label}</td>
                                <td className="py-1.5 pr-3 text-charcoal/70">{c.raw}</td>
                                <td className="py-1.5 pr-3">
                                  <div className="h-1.5 w-24 bg-line">
                                    <div className="h-full bg-pink" style={{ width: `${c.score * 100}%` }} />
                                  </div>
                                </td>
                                <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                                  {(c.contribution * 100).toFixed(1)}
                                  <span className="text-xs text-charcoal/50"> of {(c.weight * 100).toFixed(0)}</span>
                                </td>
                                <td className="py-1.5 text-xs text-charcoal/60">{c.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(() => {
                          const bid = bids.find((b) => b.id === s.bidId);
                          if (!bid) return null;
                          return (
                            <p className="mt-3 text-xs text-charcoal/60">
                              Quoted {bid.quotationDate ? new Date(bid.quotationDate).toLocaleDateString("en-GB") : "undated"}
                              {bid.validUntil ? `, valid until ${new Date(bid.validUntil).toLocaleDateString("en-GB")}` : ""}
                              {bid.incoterm ? `, ${bid.incoterm}` : ""}
                              {bid.notes ? `. ${bid.notes}` : ""}
                            </p>
                          );
                        })()}
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canAward && !awardedBidId ? (
        <form action={formAction} className="space-y-4 border-t border-line pt-5">
          <input type="hidden" name="rfqId" value={rfqId} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="bidId">Award to</label>
              <select id="bidId" name="bidId" className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {scores.map((s) => (
                  <option key={s.bidId} value={s.bidId}>{s.vendorName} ({s.total} of 100)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="reason">
                Reason {selected !== best.bidId ? "(you are not taking the suggestion, so this matters)" : "(optional)"}
              </label>
              <input id="reason" name="reason" className="input" placeholder="Existing tooling, shorter lead time" />
            </div>
          </div>
          <SubmitButton>Award and notify all bidders</SubmitButton>
          <p className="text-xs text-charcoal/55">Every vendor who quoted is emailed the outcome, including those who did not win.</p>
        </form>
      ) : null}
    </div>
  );
}
