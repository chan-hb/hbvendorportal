"use client";

import { useActionState, useState } from "react";
import type { Role } from "@prisma/client";
import { SubmitButton } from "@/components/SubmitButton";
import { setUserRoleAction, toggleUserActiveAction } from "@/app/actions/admin";
import {
  createUserAction,
  sendSetupLinkAction,
  temporaryPasswordAction,
  unlockAccountAction,
  type AuthState,
} from "@/app/actions/account";
import type { ActionState } from "@/app/actions/agreements";

const ROLES: Role[] = ["HB_ADMIN", "HB_APPROVER", "HB_USER", "VENDOR"];
const ROLE_LABEL: Record<Role, string> = {
  HB_ADMIN: "Administrator",
  HB_APPROVER: "Approver",
  HB_USER: "Huda Beauty viewer",
  VENDOR: "Vendor",
};

type UserRow = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  vendorName: string | null;
  hasPassword: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  failedLoginCount: number;
};

export function UserAdmin({ users }: { users: UserRow[] }) {
  const [createState, createAction] = useActionState<AuthState, FormData>(createUserAction, null);
  const [linkState, linkAction] = useActionState<AuthState, FormData>(sendSetupLinkAction, null);
  const [tempState, tempAction] = useActionState<AuthState, FormData>(temporaryPasswordAction, null);
  const [roleState, roleAction] = useActionState<ActionState, FormData>(setUserRoleAction, null);
  const [, toggleAction] = useActionState<ActionState, FormData>(toggleUserActiveAction, null);
  const [, unlockAction] = useActionState<ActionState, FormData>(unlockAccountAction, null);
  const [filter, setFilter] = useState("");

  const visible = users.filter(
    (u) =>
      !filter.trim() ||
      u.email.toLowerCase().includes(filter.toLowerCase()) ||
      (u.vendorName ?? "").toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <section className="panel">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Create an account</h2>
          <p className="mt-1 text-xs text-charcoal/60">
            The address must already be recognised: a Huda Beauty domain, a registered vendor domain, or one
            allow-listed on the Vendors page. They receive a link to choose their own password.
          </p>
        </header>
        <form action={createAction} className="grid gap-5 p-5 md:grid-cols-4">
          {createState?.error ? (
            <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B] md:col-span-4">
              {createState.error}
            </p>
          ) : null}
          {createState?.ok ? (
            <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44] md:col-span-4">
              {createState.ok}
            </p>
          ) : null}
          <div className="md:col-span-2">
            <label className="field-label" htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" className="input" required />
          </div>
          <div>
            <label className="field-label" htmlFor="name">Name</label>
            <input id="name" name="name" className="input" />
          </div>
          <div className="flex items-end">
            <SubmitButton>Create and send link</SubmitButton>
          </div>
        </form>
      </section>

      {tempState?.secret ? (
        <div className="border border-nude/50 bg-[#FBF0E8] p-5">
          <p className="field-label">Temporary password, shown once</p>
          <p className="mt-1 font-mono text-lg tracking-wide text-charcoal">{tempState.secret}</p>
          <p className="mt-2 text-xs text-charcoal/70">
            Pass this on by phone or in person rather than email where you can. They must change it as soon as they
            sign in, and it will not be shown again.
          </p>
        </div>
      ) : null}

      {(linkState?.ok || linkState?.error || tempState?.error || roleState?.error) ? (
        <p
          className={`border px-4 py-3 text-sm ${
            linkState?.error || tempState?.error || roleState?.error
              ? "border-[#A32B2B]/30 bg-[#FBEAEA] text-[#A32B2B]"
              : "border-[#2C6B44]/25 bg-[#EAF4EE] text-[#2C6B44]"
          }`}
        >
          {linkState?.error ?? tempState?.error ?? roleState?.error ?? linkState?.ok}
        </p>
      ) : null}

      <section className="panel">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Accounts</h2>
          <div>
            <label className="field-label" htmlFor="filter">Find</label>
            <input
              id="filter"
              className="input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Email or vendor"
            />
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">User</th>
                <th className="th">Vendor</th>
                <th className="th">Role</th>
                <th className="th">Password</th>
                <th className="th">Last sign-in</th>
                <th className="th">State</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => {
                const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                return (
                  <tr key={u.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="td">{u.email}</td>
                    <td className="td text-xs">{u.vendorName ?? "Huda Beauty"}</td>
                    <td className="td">
                      <form action={roleAction} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="role" defaultValue={u.role} className="input max-w-[170px] py-1 text-xs">
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                          ))}
                        </select>
                        <SubmitButton className="btn-ghost px-3 py-1">Set</SubmitButton>
                      </form>
                    </td>
                    <td className="td text-xs">
                      {!u.hasPassword ? (
                        <span className="badge border-nude/40 bg-[#FBF0E8] text-nude">Not set up</span>
                      ) : u.mustChangePassword ? (
                        <span className="badge border-nude/40 bg-[#FBF0E8] text-nude">Temporary</span>
                      ) : (
                        <span className="badge border-[#2C6B44]/25 bg-[#EAF4EE] text-[#2C6B44]">Set</span>
                      )}
                      {u.failedLoginCount > 0 ? (
                        <span className="mt-1 block text-charcoal/55">{u.failedLoginCount} failed attempts</span>
                      ) : null}
                    </td>
                    <td className="td text-xs text-charcoal/60">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("en-GB") : "Never"}
                    </td>
                    <td className="td">
                      <form action={toggleAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button
                          className={`badge ${
                            u.isActive
                              ? "border-[#2C6B44]/25 bg-[#EAF4EE] text-[#2C6B44]"
                              : "border-line bg-cloud text-charcoal/60"
                          }`}
                        >
                          {u.isActive ? "Active" : "Disabled"}
                        </button>
                      </form>
                      {locked ? <span className="mt-1 block text-xs text-[#A32B2B]">Locked out</span> : null}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-2">
                        <form action={linkAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button className="text-xs font-bold uppercase tracking-[0.1em] text-pink hover:underline">
                            Send link
                          </button>
                        </form>
                        <form action={tempAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button className="text-xs font-bold uppercase tracking-[0.1em] text-charcoal/60 hover:text-pink">
                            Temp password
                          </button>
                        </form>
                        {locked ? (
                          <form action={unlockAction}>
                            <input type="hidden" name="userId" value={u.id} />
                            <button className="text-xs font-bold uppercase tracking-[0.1em] text-[#A32B2B] hover:underline">
                              Unlock
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
