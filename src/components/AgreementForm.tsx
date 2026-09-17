"use client";

import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { ActionState } from "@/app/actions/agreements";

type ItemOption = { itemNumber: string; productName: string | null; unit: string | null; dataAreaId: string };

export type AgreementFormValues = {
  id?: string;
  dataAreaId?: string;
  itemNumber?: string;
  currency?: string;
  amount?: string;
  unit?: string;
  fromDate?: string;
  toDate?: string;
  notes?: string;
};

export function AgreementForm({
  action,
  legalEntities,
  currencies,
  initial,
  mode,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  legalEntities: { code: string; name: string; currency: string | null }[];
  currencies: string[];
  initial?: AgreementFormValues;
  mode: "create" | "edit";
}) {
  const [state, formAction] = useActionState(action, null);
  const [dataAreaId, setDataAreaId] = useState(initial?.dataAreaId ?? legalEntities[0]?.code ?? "");
  const [query, setQuery] = useState(initial?.itemNumber ?? "");
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [selected, setSelected] = useState<ItemOption | null>(null);

  useEffect(() => {
    if (mode === "edit") return;
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) return setOptions([]);
      const res = await fetch(`/api/items?q=${encodeURIComponent(query)}&dataAreaId=${dataAreaId}`);
      if (!res.ok) return;
      const json = (await res.json()) as { items: ItemOption[] };
      setOptions(json.items);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, dataAreaId, mode]);

  return (
    <form action={formAction} className="space-y-6">
      {initial?.id ? <input type="hidden" name="agreementId" value={initial.id} /> : null}

      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="dataAreaId">Legal entity</label>
          <select
            id="dataAreaId"
            name="dataAreaId"
            className="input"
            value={dataAreaId}
            onChange={(e) => setDataAreaId(e.target.value)}
            disabled={mode === "edit"}
            required
          >
            {legalEntities.map((le) => (
              <option key={le.code} value={le.code}>
                {le.code.toUpperCase()} . {le.name}
              </option>
            ))}
          </select>
          {mode === "edit" ? <input type="hidden" name="dataAreaId" value={dataAreaId} /> : null}
        </div>

        <div>
          <label className="field-label" htmlFor="itemNumber">Item</label>
          <input
            id="itemNumber"
            name="itemNumber"
            className="input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            list="item-options"
            placeholder="Start typing an item number or name"
            disabled={mode === "edit"}
            required
            autoComplete="off"
          />
          {mode === "edit" ? <input type="hidden" name="itemNumber" value={query} /> : null}
          <datalist id="item-options">
            {options.map((o) => (
              <option key={`${o.dataAreaId}-${o.itemNumber}`} value={o.itemNumber}>
                {o.productName ?? ""}
              </option>
            ))}
          </datalist>
          {options.length > 0 && !selected ? (
            <ul className="mt-1 max-h-44 overflow-y-auto border border-line bg-white text-sm">
              {options.map((o) => (
                <li key={`${o.dataAreaId}-${o.itemNumber}`}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-cloud"
                    onClick={() => {
                      setQuery(o.itemNumber);
                      setSelected(o);
                      setOptions([]);
                    }}
                  >
                    <span className="font-medium">{o.itemNumber}</span>
                    <span className="ml-2 text-charcoal/60">{o.productName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {selected ? (
            <p className="mt-1 text-xs text-charcoal/60">{selected.productName}</p>
          ) : null}
        </div>

        <div>
          <label className="field-label" htmlFor="currency">Currency</label>
          <select id="currency" name="currency" className="input" defaultValue={initial?.currency ?? currencies[0]} required>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="amount">Amount per unit</label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.0001"
            min="0"
            className="input"
            defaultValue={initial?.amount}
            required
          />
        </div>

        <div>
          <label className="field-label" htmlFor="fromDate">Valid from</label>
          <input id="fromDate" name="fromDate" type="date" className="input" defaultValue={initial?.fromDate} required />
        </div>

        <div>
          <label className="field-label" htmlFor="toDate">Valid to (optional)</label>
          <input id="toDate" name="toDate" type="date" className="input" defaultValue={initial?.toDate} />
        </div>

        <div>
          <label className="field-label" htmlFor="unit">Unit (optional)</label>
          <input id="unit" name="unit" className="input" defaultValue={initial?.unit ?? selected?.unit ?? ""} />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="notes">Notes for the approver</label>
        <textarea id="notes" name="notes" rows={4} className="input" defaultValue={initial?.notes} />
      </div>

      <div className="flex flex-wrap gap-3">
        <SubmitButton name="intent" value="submit">
          {mode === "edit" ? "Resubmit for approval" : "Submit for approval"}
        </SubmitButton>
        {mode === "create" ? (
          <SubmitButton name="intent" value="draft" className="btn-ghost">
            Save as draft
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
