"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { addWatcherAction, inviteVendorsAction, removeWatcherAction } from "@/app/actions/rfq";
import type { ActionState } from "@/app/actions/agreements";

type VendorOption = { id: string; name: string; code: string; contactCount: number; invited: boolean };

export function RfqInvite({
  rfqId,
  vendors,
  watchers,
  staff,
}: {
  rfqId: string;
  vendors: VendorOption[];
  watchers: { userId: string; email: string }[];
  staff: { id: string; email: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(inviteVendorsAction, null);
  const [watchState, watchAction] = useActionState<ActionState, FormData>(addWatcherAction, null);
  const [, unwatchAction] = useActionState<ActionState, FormData>(removeWatcherAction, null);
  const [filter, setFilter] = useState("");

  const available = vendors.filter(
    (v) =>
      !v.invited &&
      (!filter.trim() ||
        v.name.toLowerCase().includes(filter.toLowerCase()) ||
        v.code.toLowerCase().includes(filter.toLowerCase())),
  );

  return (
    <div className="space-y-6 p-5">
      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
      ) : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="rfqId" value={rfqId} />

        <div>
          <label className="field-label" htmlFor="vendorFilter">Find vendors</label>
          <input
            id="vendorFilter"
            className="input max-w-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Name or account code"
          />
        </div>

        <div className="max-h-72 overflow-y-auto border border-line">
          {available.length === 0 ? (
            <p className="px-4 py-6 text-sm text-charcoal/60">
              {vendors.length === 0
                ? "No vendors in the master yet. Run a vendor refresh from the integration page."
                : "Everyone matching is already invited."}
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {available.map((v) => (
                <li key={v.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-cloud/50">
                    <input type="checkbox" name="vendorIds" value={v.id} className="h-4 w-4 accent-pink" />
                    <span className="flex-1">
                      <span className="text-sm font-medium">{v.name}</span>
                      <span className="block text-xs text-charcoal/55">{v.code}</span>
                    </span>
                    {v.contactCount === 0 ? (
                      <span className="badge border-nude/40 bg-[#FBF0E8] text-nude">No contact</span>
                    ) : (
                      <span className="text-xs text-charcoal/50">
                        {v.contactCount} contact{v.contactCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-charcoal/55">
          A vendor marked as having no contact can be invited, but nobody will receive the email until an
          administrator adds a domain or an allow-listed address for them on the Vendors page.
        </p>

        <SubmitButton>Invite selected and send emails</SubmitButton>
      </form>

      <div className="border-t border-line pt-5">
        <p className="field-label">Notify these people when all quotations are in</p>
        <p className="mb-3 text-xs text-charcoal/55">
          The person who raised the RFQ is always notified. Add anyone else who needs to know.
        </p>

        <ul className="mb-3 flex flex-wrap gap-2">
          {watchers.map((w) => (
            <li key={w.userId} className="flex items-center gap-2 border border-line px-3 py-1 text-xs">
              {w.email}
              <form action={unwatchAction}>
                <input type="hidden" name="rfqId" value={rfqId} />
                <input type="hidden" name="userId" value={w.userId} />
                <button className="text-pink hover:underline">Remove</button>
              </form>
            </li>
          ))}
          {watchers.length === 0 ? <li className="text-xs text-charcoal/50">Nobody added yet</li> : null}
        </ul>

        {watchState?.error ? <p className="mb-2 text-xs text-[#A32B2B]">{watchState.error}</p> : null}

        <form action={watchAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="rfqId" value={rfqId} />
          <div className="min-w-[240px]">
            <label className="field-label" htmlFor="userId">Huda Beauty user</label>
            <select id="userId" name="userId" className="input" required>
              {staff
                .filter((s) => !watchers.some((w) => w.userId === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.email}</option>
                ))}
            </select>
          </div>
          <SubmitButton className="btn-ghost">Add</SubmitButton>
        </form>
      </div>
    </div>
  );
}
