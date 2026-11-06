"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { declineInvitationAction, submitBidAction } from "@/app/actions/rfq";
import type { ActionState } from "@/app/actions/agreements";

type Tier = { quantity: number; unitPrice: string; notes: string };

export function BidForm({
  rfqId,
  currency,
  unit,
  launchQuantity,
  fullYearQuantity,
  quantityTiers,
  requestedIncoterm,
  existing,
  readOnly,
}: {
  rfqId: string;
  currency: string;
  unit?: string | null;
  launchQuantity: number;
  fullYearQuantity: number;
  quantityTiers: number[];
  requestedIncoterm?: string | null;
  existing?: {
    status: string;
    notes: string;
    quotationDate: string;
    validUntil: string;
    leadTimeDays: string;
    weeklyCapacity: string;
    samplingLeadTimeDays: string;
    moq: string;
    paymentTermsDays: string;
    incoterm: string;
    tiers: { quantity: number; unitPrice: string; notes: string }[];
  };
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(submitBidAction, null);
  const [declineState, declineAction] = useActionState<ActionState, FormData>(declineInvitationAction, null);
  const [showDecline, setShowDecline] = useState(false);

  // Every requested break is shown as a row. Leaving one blank simply means it
  // is not offered, which is a legitimate answer.
  const [tiers, setTiers] = useState<Tier[]>(() => {
    const asked = quantityTiers.length ? quantityTiers : [launchQuantity];
    const quoted = new Map(existing?.tiers.map((t) => [t.quantity, t]) ?? []);
    const rows = asked.map((q) => ({
      quantity: q,
      unitPrice: quoted.get(q)?.unitPrice ?? "",
      notes: quoted.get(q)?.notes ?? "",
    }));
    // Anything the supplier quoted at a volume that was not asked for is kept.
    for (const [q, t] of quoted) {
      if (!asked.includes(q)) rows.push({ quantity: q, unitPrice: t.unitPrice, notes: t.notes });
    }
    return rows.sort((a, b) => a.quantity - b.quantity);
  });

  const [weeklyCapacity, setWeeklyCapacity] = useState(existing?.weeklyCapacity ?? "");
  const [leadTimeDays, setLeadTimeDays] = useState(existing?.leadTimeDays ?? "");

  const summary = useMemo(() => {
    const priced = tiers.filter((t) => Number(t.unitPrice) > 0);
    const atOrBelow = priced.filter((t) => t.quantity <= launchQuantity);
    const reference = atOrBelow.length ? atOrBelow[atOrBelow.length - 1] : priced[0];
    const capacity = Number(weeklyCapacity);
    const lead = Number(leadTimeDays);
    const weeksForLaunch = capacity > 0 ? launchQuantity / capacity : null;
    const weeksForYear = capacity > 0 ? fullYearQuantity / capacity : null;
    return {
      pricedCount: priced.length,
      referencePrice: reference ? Number(reference.unitPrice) : null,
      referenceTier: reference?.quantity ?? null,
      daysToLaunch: weeksForLaunch !== null && lead > 0 ? Math.ceil(lead + weeksForLaunch * 7) : null,
      weeksForYear: weeksForYear !== null ? Math.ceil(weeksForYear) : null,
      yearWithinCapacity: weeksForYear !== null ? weeksForYear <= 52 : null,
    };
  }, [tiers, launchQuantity, fullYearQuantity, weeklyCapacity, leadTimeDays]);

  if (readOnly) {
    return (
      <div className="space-y-3 p-5">
        <p className="text-sm text-charcoal/70">
          Your quotation is in and can no longer be changed, because the RFQ has closed.
        </p>
        <ul className="space-y-1 text-sm">
          {tiers.filter((t) => t.unitPrice).map((t) => (
            <li key={t.quantity}>
              {t.quantity.toLocaleString()} {unit ?? ""} at {currency} {t.unitPrice}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5">
      {state?.error ? (
        <p className="alert-error">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="alert-ok">{state.ok}</p>
      ) : null}
      {declineState?.ok ? (
        <p className="border border-line bg-cloud px-4 py-3 text-sm text-charcoal">{declineState.ok}</p>
      ) : null}

      <form action={formAction} className="space-y-6">
        <input type="hidden" name="rfqId" value={rfqId} />

        <section>
          <p className="eyebrow">Price by quantity</p>
          <p className="mt-1 text-xs text-charcoal/55">
            Leave a row blank if you would rather not supply that volume.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="th">Quantity {unit ? `(${unit})` : ""}</th>
                  <th className="th">Unit price ({currency})</th>
                  <th className="th">Note</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) => (
                  <tr
                    key={t.quantity}
                    className={`border-t border-line/60 ${t.quantity === summary.referenceTier ? "bg-pink-50/60" : ""}`}
                  >
                    <td className="td font-medium">
                      {t.quantity.toLocaleString()}
                      <input type="hidden" name="quantity" value={t.quantity} />
                      {t.quantity === summary.referenceTier ? (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.1em] text-pink">
                          Compared on this
                        </span>
                      ) : null}
                    </td>
                    <td className="td">
                      <input
                        name="unitPrice"
                        type="number"
                        step="0.0001"
                        min="0"
                        className="input py-1"
                        value={t.unitPrice}
                        onChange={(e) =>
                          setTiers((rows) => rows.map((r, idx) => (idx === i ? { ...r, unitPrice: e.target.value } : r)))
                        }
                      />
                    </td>
                    <td className="td">
                      <input
                        name="lineNotes"
                        className="input py-1"
                        value={t.notes}
                        onChange={(e) =>
                          setTiers((rows) => rows.map((r, idx) => (idx === i ? { ...r, notes: e.target.value } : r)))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <p className="eyebrow">Your production and terms</p>
          <p className="mt-1 text-xs text-charcoal/55">
            Lead time, capacity and minimum order all carry weight in how quotations are compared, so it is worth
            being accurate rather than optimistic. Payment terms are recorded but not scored.
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="field-label field-label-required" htmlFor="samplingLeadTimeDays">
                Sampling lead time (days)
              </label>
              <input
                id="samplingLeadTimeDays"
                name="samplingLeadTimeDays"
                type="number"
                min="0"
                max="365"
                className="input"
                required
                defaultValue={existing?.samplingLeadTimeDays}
                placeholder="14"
              />
              <p className="mt-1 text-xs text-charcoal/55">How long a first sample takes.</p>
            </div>
            <div>
              <label className="field-label field-label-required" htmlFor="leadTimeDays">Production lead time (days)</label>
              <input
                id="leadTimeDays"
                name="leadTimeDays"
                type="number"
                min="0"
                className="input"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                placeholder="45"
                required
              />
            </div>
            <div>
              <label className="field-label field-label-required" htmlFor="weeklyCapacity">Weekly capacity {unit ? `(${unit})` : ""}</label>
              <input
                id="weeklyCapacity"
                name="weeklyCapacity"
                type="number"
                step="0.0001"
                min="0"
                className="input"
                value={weeklyCapacity}
                onChange={(e) => setWeeklyCapacity(e.target.value)}
                placeholder="20000"
                required
              />
            </div>
            <div>
              <label className="field-label field-label-required" htmlFor="moq">Minimum order quantity</label>
              <input id="moq" name="moq" type="number" step="0.0001" min="0" className="input" required defaultValue={existing?.moq} />
            </div>
            <div>
              <label className="field-label" htmlFor="incoterm">Incoterm</label>
              <input
                id="incoterm"
                name="incoterm"
                className="input"
                defaultValue={existing?.incoterm ?? requestedIncoterm ?? ""}
              />
            </div>
            <div>
              <label className="field-label field-label-required" htmlFor="paymentTermsDays">
                Payment terms (days)
              </label>
              <input
                id="paymentTermsDays"
                name="paymentTermsDays"
                type="number"
                min="0"
                max="365"
                className="input"
                required
                defaultValue={existing?.paymentTermsDays}
                placeholder="60"
              />
              <p className="mt-1 text-xs text-charcoal/55">
                Days from invoice, for example 45, 60 or 90.
              </p>
            </div>
            <div>
              <label className="field-label" htmlFor="quotationDate">Quotation date</label>
              <input
                id="quotationDate"
                name="quotationDate"
                type="date"
                className="input"
                defaultValue={existing?.quotationDate || new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="validUntil">Price valid until</label>
              <input id="validUntil" name="validUntil" type="date" className="input" defaultValue={existing?.validUntil} />
            </div>
          </div>
        </section>

        <div className="grid gap-4 border-y border-line py-4 sm:grid-cols-4">
          <Stat label="Breaks priced" value={`${summary.pricedCount} of ${tiers.length}`} />
          <Stat
            label={summary.referenceTier ? `Price at ${summary.referenceTier.toLocaleString()}` : "Compared price"}
            value={summary.referencePrice ? `${currency} ${summary.referencePrice.toFixed(4)}` : "-"}
          />
          <Stat
            label={`Time to supply ${launchQuantity.toLocaleString()}`}
            value={summary.daysToLaunch ? `About ${summary.daysToLaunch} days` : "Needs lead time and capacity"}
            warn={!summary.daysToLaunch}
          />
          <Stat
            label={`Production for ${fullYearQuantity.toLocaleString()}`}
            value={summary.weeksForYear ? `${summary.weeksForYear} weeks` : "Needs capacity"}
            warn={summary.yearWithinCapacity === false}
          />
        </div>

        {summary.yearWithinCapacity === false ? (
          <p className="alert-note">
            At the capacity you have entered, the full year volume would take more than a year to produce. That is
            worth a note below if you would plan to add capacity.
          </p>
        ) : null}

        <div>
          <label className="field-label" htmlFor="notes">Notes for the buyer</label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="input"
            defaultValue={existing?.notes}
            placeholder="Tooling costs, material assumptions, anything conditional about the price"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <SubmitButton name="intent" value="submit">
            {existing?.status === "SUBMITTED" ? "Update quotation" : "Submit quotation"}
          </SubmitButton>
          <SubmitButton name="intent" value="draft" className="btn-ghost">Save draft</SubmitButton>
          <button type="button" className="btn-ghost" onClick={() => setShowDecline((s) => !s)}>
            Not quoting
          </button>
        </div>
      </form>

      {showDecline ? (
        <form action={declineAction} className="space-y-3 border border-line p-4">
          <input type="hidden" name="rfqId" value={rfqId} />
          <label className="field-label" htmlFor="note">Let the buyer know why, if you would like to</label>
          <input id="note" name="note" className="input" placeholder="Capacity is committed until Q2" />
          <SubmitButton className="btn-dark">Confirm we are not quoting</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className={`text-lg font-semibold ${warn ? "text-nude" : "text-charcoal"}`}>{value}</p>
    </div>
  );
}
