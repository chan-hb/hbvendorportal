"use client";

import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { ActionState } from "@/app/actions/agreements";

type ItemOption = { itemNumber: string; productName: string | null; unit: string | null };
type LocalItem = { id: string; localCode: string; name: string; unit: string | null; erpItemNumber: string | null };

export function RfqForm({
  action,
  legalEntities,
  localItems,
  standardTiers,
  defaultPaymentTerms,
  defaultIncoterm,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  legalEntities: { code: string; name: string; currency: string | null }[];
  localItems: LocalItem[];
  standardTiers: number[];
  defaultPaymentTerms?: string | null;
  defaultIncoterm?: string | null;
}) {
  const [state, formAction] = useActionState(action, null);
  const [itemSource, setItemSource] = useState<"ERP" | "LOCAL">("ERP");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ItemOption[]>([]);
  const [tiers, setTiers] = useState<number[]>(standardTiers.slice(0, 4));
  const [customTier, setCustomTier] = useState("");
  const [weights, setWeights] = useState({ price: 45, leadTime: 25, capacity: 20, reliability: 10 });

  const total = weights.price + weights.leadTime + weights.capacity + weights.reliability;
  const allTiers = Array.from(new Set([...standardTiers, ...tiers])).sort((a, b) => a - b);

  useEffect(() => {
    if (itemSource !== "ERP") return;
    const t = setTimeout(async () => {
      if (query.trim().length < 2) return setOptions([]);
      const res = await fetch(`/api/items?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { items: ItemOption[] };
      setOptions(json.items);
    }, 250);
    return () => clearTimeout(t);
  }, [query, itemSource]);

  function toggleTier(value: number) {
    setTiers((t) => (t.includes(value) ? t.filter((x) => x !== value) : [...t, value].sort((a, b) => a - b)));
  }

  return (
    <form action={formAction} className="space-y-6 p-6">
      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}

      <div>
        <label className="field-label" htmlFor="title">Title</label>
        <input id="title" name="title" className="input" required placeholder="Compact powder outer carton, Q4 launch" />
      </div>

      <fieldset>
        <legend className="field-label">What are you sourcing?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["ERP", "An item in Dynamics 365"], ["LOCAL", "An item not in the ERP yet"]] as const).map(([v, label]) => (
            <label
              key={v}
              className={`cursor-pointer border px-3 py-2 text-center text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                itemSource === v ? "border-pink bg-pink text-white" : "border-line bg-white text-charcoal/70"
              }`}
            >
              <input type="radio" className="sr-only" checked={itemSource === v} onChange={() => setItemSource(v)} />
              {label}
            </label>
          ))}
        </div>
        <input type="hidden" name="itemSource" value={itemSource} />
      </fieldset>

      {itemSource === "ERP" ? (
        <div>
          <label className="field-label" htmlFor="itemNumber">Item</label>
          <input
            id="itemNumber"
            name="itemNumber"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Start typing an item number or name"
            autoComplete="off"
          />
          {options.length > 0 ? (
            <ul className="mt-1 max-h-44 overflow-y-auto border border-line bg-white text-sm">
              {options.map((o) => (
                <li key={o.itemNumber}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-cloud"
                    onClick={() => { setQuery(o.itemNumber); setOptions([]); }}
                  >
                    <span className="font-medium">{o.itemNumber}</span>
                    <span className="ml-2 text-charcoal/60">{o.productName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div>
          <label className="field-label" htmlFor="localItemId">Local item</label>
          {localItems.length === 0 ? (
            <p className="border border-nude/40 bg-[#FBF0E8] px-4 py-3 text-sm text-nude">
              Nothing created yet. Create one on the New items page first.
            </p>
          ) : (
            <select id="localItemId" name="localItemId" className="input" required>
              {localItems.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.localCode} . {l.name}{l.erpItemNumber ? ` (ERP ${l.erpItemNumber})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Quantity breaks. This is what suppliers price against. */}
      <fieldset className="border-t border-line pt-5">
        <legend className="eyebrow">Quantity breaks to be priced</legend>
        <p className="mt-1 text-xs text-charcoal/55">
          Suppliers return a price against each. Ask for the volumes you might realistically order, since every
          extra break is more work for them and more to compare.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {allTiers.map((t) => (
            <label
              key={t}
              className={`cursor-pointer border px-4 py-2 text-sm transition ${
                tiers.includes(t) ? "border-pink bg-pink text-white" : "border-line bg-white text-charcoal/70"
              }`}
            >
              <input type="checkbox" className="sr-only" checked={tiers.includes(t)} onChange={() => toggleTier(t)} />
              {t.toLocaleString()}
            </label>
          ))}
        </div>
        {tiers.map((t) => (
          <input key={t} type="hidden" name="quantityTiers" value={t} />
        ))}

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="field-label" htmlFor="customTier">Add another quantity</label>
            <input
              id="customTier"
              className="input max-w-[180px]"
              value={customTier}
              onChange={(e) => setCustomTier(e.target.value)}
              placeholder="750000"
              inputMode="numeric"
            />
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              const n = Number(customTier.replace(/[, ]/g, ""));
              if (Number.isFinite(n) && n > 0) {
                setTiers((t) => Array.from(new Set([...t, n])).sort((a, b) => a - b));
                setCustomTier("");
              }
            }}
          >
            Add
          </button>
          {tiers.length === 0 ? (
            <p className="pb-2 text-xs text-[#A32B2B]">Choose at least one</p>
          ) : null}
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="dataAreaId">Legal entity</label>
          <select id="dataAreaId" name="dataAreaId" className="input" required>
            {legalEntities.map((le) => (
              <option key={le.code} value={le.code}>{le.code.toUpperCase()} . {le.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="currency">Currency</label>
          <select id="currency" name="currency" className="input" required>
            {Array.from(new Set([...legalEntities.map((l) => l.currency).filter(Boolean) as string[], "USD", "AED", "EUR", "GBP"])).map(
              (c) => <option key={c} value={c}>{c}</option>,
            )}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="targetQuantity">Quantity you expect to order</label>
          <input id="targetQuantity" name="targetQuantity" type="number" step="0.0001" min="0" className="input" required />
          <p className="mt-1 text-xs text-charcoal/55">Used to pick which price break each supplier is compared on.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="unit">Unit</label>
          <input id="unit" name="unit" className="input" placeholder="PCS" />
        </div>
        <div>
          <label className="field-label" htmlFor="closesAt">Quotations close</label>
          <input id="closesAt" name="closesAt" type="date" className="input" required />
        </div>
        <div>
          <label className="field-label" htmlFor="requiredByDate">Target in market date (optional)</label>
          <input id="requiredByDate" name="requiredByDate" type="date" className="input" />
          <p className="mt-1 text-xs text-charcoal/55">Context only. Timing is judged on lead time and capacity.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="requestedPaymentTerms">Payment terms sought</label>
          <input
            id="requestedPaymentTerms"
            name="requestedPaymentTerms"
            className="input"
            defaultValue={defaultPaymentTerms ?? ""}
            placeholder="60 days from invoice"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="requestedIncoterm">Incoterm sought</label>
          <input
            id="requestedIncoterm"
            name="requestedIncoterm"
            className="input"
            defaultValue={defaultIncoterm ?? ""}
            placeholder="DDP"
          />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="notes">Brief</label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          className="input"
          placeholder="Specification, tolerances, materials, packing requirements, artwork status"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="brief">Attach the brief</label>
        <input
          id="brief"
          name="brief"
          type="file"
          multiple
          className="input"
          accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.ai,.zip"
        />
        <p className="mt-1 text-xs text-charcoal/55">
          Up to 8 MB each. Attachments are sent with the invitation email, so a supplier can judge the job without
          signing in. More can be added later.
        </p>
      </div>

      <div className="border-t border-line pt-5">
        <p className="eyebrow">How bids should be scored</p>
        <p className="mt-1 text-xs text-charcoal/55">
          Relative weights, so they need not add to 100. Favour lead time when a launch date is fixed, price when
          it is not.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-4">
          {([
            ["price", "Price", "weightPrice"],
            ["leadTime", "Lead time", "weightLeadTime"],
            ["capacity", "Capacity", "weightCapacity"],
            ["reliability", "Track record", "weightReliability"],
          ] as const).map(([key, label, name]) => (
            <div key={key}>
              <label className="field-label" htmlFor={name}>
                {label} . {total > 0 ? Math.round((weights[key] / total) * 100) : 0}%
              </label>
              <input
                id={name}
                name={name}
                type="range"
                min={0}
                max={100}
                value={weights[key]}
                onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                className="w-full accent-pink"
              />
            </div>
          ))}
        </div>
      </div>

      <SubmitButton>Create and choose vendors</SubmitButton>
    </form>
  );
}
