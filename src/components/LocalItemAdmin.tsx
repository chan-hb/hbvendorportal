"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { createLocalItemAction, linkLocalItemAction } from "@/app/actions/rfq";
import type { ActionState } from "@/app/actions/agreements";

type LocalItem = {
  id: string;
  localCode: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  erpItemNumber: string | null;
  erpLinkedAt: string | null;
  createdByEmail: string;
  createdAt: string;
  rfqCount: number;
  inMaster: boolean;
};

export function LocalItemAdmin({ items }: { items: LocalItem[] }) {
  const [createState, createAction] = useActionState<ActionState, FormData>(createLocalItemAction, null);
  const [linkState, linkAction] = useActionState<ActionState, FormData>(linkLocalItemAction, null);

  return (
    <div className="space-y-6">
      <section className="panel">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Create an item</h2>
          <p className="mt-1 text-xs text-charcoal/60">
            For things you want to source before they exist in Dynamics 365. Each gets a local code you can quote
            against straight away, and an ERP number recorded later once the item is created.
          </p>
        </header>
        <form action={createAction} className="grid gap-5 p-5 md:grid-cols-3">
          {createState?.error ? (
            <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B] md:col-span-3">
              {createState.error}
            </p>
          ) : null}
          {createState?.ok ? (
            <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44] md:col-span-3">
              {createState.ok}
            </p>
          ) : null}

          <div className="md:col-span-2">
            <label className="field-label" htmlFor="name">Item name</label>
            <input id="name" name="name" className="input" required />
          </div>
          <div>
            <label className="field-label" htmlFor="category">Category</label>
            <input id="category" name="category" className="input" placeholder="Packaging" />
          </div>
          <div className="md:col-span-3">
            <label className="field-label" htmlFor="description">Description</label>
            <textarea id="description" name="description" rows={2} className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="unit">Unit</label>
            <input id="unit" name="unit" className="input" placeholder="PCS" />
          </div>
          <div>
            <label className="field-label" htmlFor="targetPrice">Target price</label>
            <input id="targetPrice" name="targetPrice" type="number" step="0.0001" min="0" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="currency">Currency</label>
            <input id="currency" name="currency" className="input" placeholder="USD" maxLength={3} />
          </div>
          <div className="md:col-span-3">
            <SubmitButton>Create item</SubmitButton>
          </div>
        </form>
      </section>

      <section className="panel">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Locally created items</h2>
        </header>

        {linkState?.error ? (
          <p className="border-b border-[#A32B2B]/30 bg-[#FBEAEA] px-5 py-3 text-sm text-[#A32B2B]">{linkState.error}</p>
        ) : null}
        {linkState?.ok ? (
          <p className="border-b border-[#2C6B44]/25 bg-[#EAF4EE] px-5 py-3 text-sm text-[#2C6B44]">{linkState.ok}</p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Local code</th>
                <th className="th">Item</th>
                <th className="th">Unit</th>
                <th className="th">RFQs</th>
                <th className="th">ERP item number</th>
                <th className="th">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td className="td text-charcoal/60" colSpan={6}>Nothing created yet.</td></tr>
              ) : (
                items.map((i) => (
                  <tr key={i.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="td font-medium">{i.localCode}</td>
                    <td className="td">
                      {i.name}
                      {i.description ? <span className="block text-xs text-charcoal/55">{i.description}</span> : null}
                    </td>
                    <td className="td">{i.unit ?? "-"}</td>
                    <td className="td">{i.rfqCount}</td>
                    <td className="td">
                      {i.erpItemNumber ? (
                        <div>
                          <span className="font-medium">{i.erpItemNumber}</span>
                          {i.inMaster ? (
                            <span className="ml-2 badge border-[#2C6B44]/25 bg-[#EAF4EE] text-[#2C6B44]">In master</span>
                          ) : (
                            <span className="ml-2 badge border-nude/40 bg-[#FBF0E8] text-nude">Awaiting sync</span>
                          )}
                        </div>
                      ) : (
                        <form action={linkAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="localItemId" value={i.id} />
                          <input
                            name="erpItemNumber"
                            className="input max-w-[160px] py-1 text-xs"
                            placeholder="ITM-0001"
                            required
                          />
                          <SubmitButton className="btn-ghost px-3 py-1">Link</SubmitButton>
                        </form>
                      )}
                    </td>
                    <td className="td text-xs text-charcoal/60">
                      {i.createdByEmail}
                      <span className="block">{new Date(i.createdAt).toLocaleDateString("en-GB")}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
