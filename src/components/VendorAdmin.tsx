"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  addAllowedEmailAction,
  removeAllowedEmailAction,
  updateVendorAccessAction,
} from "@/app/actions/admin";
import type { ActionState } from "@/app/actions/agreements";

type Vendor = {
  id: string;
  code: string;
  name: string;
  domains: string[];
  isActive: boolean;
  isBlocked: boolean;
  allowedEmails: { id: string; email: string }[];
  _count: { users: number; agreements: number; items: number };
};

export function VendorAdmin({ vendors }: { vendors: Vendor[] }) {
  const [accessState, accessAction] = useActionState<ActionState, FormData>(updateVendorAccessAction, null);
  const [emailState, emailAction] = useActionState<ActionState, FormData>(addAllowedEmailAction, null);
  const [, removeAction] = useActionState<ActionState, FormData>(removeAllowedEmailAction, null);
  const [filter, setFilter] = useState("");
  const [onlyWithAccess, setOnlyWithAccess] = useState(false);

  const visible = vendors.filter((v) => {
    if (onlyWithAccess && v.domains.length === 0 && v.allowedEmails.length === 0) return false;
    if (!filter.trim()) return true;
    const needle = filter.trim().toLowerCase();
    return v.name.toLowerCase().includes(needle) || v.code.toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-6">
      {accessState?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">
          {accessState.error}
        </p>
      ) : null}
      {accessState?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{accessState.ok}</p>
      ) : null}

      <section className="panel">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Allow a single email</h2>
          <p className="mt-1 text-xs text-charcoal/60">
            For contacts on shared mail domains that cannot be matched by domain.
          </p>
        </header>
        <form action={emailAction} className="flex flex-wrap items-end gap-4 p-5">
          {emailState?.error ? (
            <p className="w-full border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">
              {emailState.error}
            </p>
          ) : null}
          {emailState?.ok ? (
            <p className="w-full border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">
              {emailState.ok}
            </p>
          ) : null}
          <div className="min-w-[240px] flex-1">
            <label className="field-label" htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" className="input" required />
          </div>
          <div className="min-w-[260px]">
            <label className="field-label" htmlFor="vendorId">Vendor</label>
            <select id="vendorId" name="vendorId" className="input" required>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
              ))}
            </select>
          </div>
          <SubmitButton>Grant access</SubmitButton>
        </form>
      </section>

      <section className="panel">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Vendor master</h2>
            <p className="mt-1 text-xs text-charcoal/60">
              Names and codes come from Dynamics 365 and are overwritten on every sync. Domains and portal
              access are yours to set.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="field-label" htmlFor="filter">Find a vendor</label>
              <input
                id="filter"
                className="input"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Name or account"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs">
              <input
                type="checkbox"
                className="h-4 w-4 accent-pink"
                checked={onlyWithAccess}
                onChange={(e) => setOnlyWithAccess(e.target.checked)}
              />
              Only those with sign-in access
            </label>
          </div>
        </header>

        <p className="border-b border-line bg-cloud/60 px-5 py-2 text-xs text-charcoal/60">
          Showing {visible.length} of {vendors.length}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Vendor</th>
                <th className="th">Email domains and access</th>
                <th className="th">Allow-listed</th>
                <th className="th">Items</th>
                <th className="th">Users</th>
                <th className="th">Agreements</th>
                <th className="th">ERP</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td className="td text-charcoal/60" colSpan={7}>
                    No vendors match. Run a vendor refresh from the integration page if the list is empty.
                  </td>
                </tr>
              ) : (
                visible.map((v) => (
                  <tr key={v.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="td">
                      <span className="font-medium">{v.name}</span>
                      <span className="block text-xs text-charcoal/60">{v.code}</span>
                    </td>
                    <td className="td">
                      <form action={accessAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={v.id} />
                        <input
                          name="domains"
                          className="input max-w-[260px] py-1 text-xs"
                          defaultValue={v.domains.join(", ")}
                          placeholder="acme.com, acme.co.uk"
                        />
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            name="isActive"
                            defaultChecked={v.isActive}
                            className="h-4 w-4 accent-pink"
                          />
                          Access
                        </label>
                        <SubmitButton className="btn-ghost px-3 py-1">Save</SubmitButton>
                      </form>
                    </td>
                    <td className="td">
                      {v.allowedEmails.length === 0 ? (
                        <span className="text-xs text-charcoal/50">None</span>
                      ) : (
                        <ul className="space-y-1">
                          {v.allowedEmails.map((e) => (
                            <li key={e.id} className="flex items-center gap-2 text-xs">
                              {e.email}
                              <form action={removeAction}>
                                <input type="hidden" name="id" value={e.id} />
                                <button className="text-pink hover:underline">Remove</button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="td">{v._count.items}</td>
                    <td className="td">{v._count.users}</td>
                    <td className="td">{v._count.agreements}</td>
                    <td className="td">
                      {v.isBlocked ? (
                        <span className="badge border-[#A32B2B]/25 bg-[#FBEAEA] text-[#A32B2B]">Blocked</span>
                      ) : (
                        <span className="badge border-line bg-cloud text-charcoal/60">Open</span>
                      )}
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
