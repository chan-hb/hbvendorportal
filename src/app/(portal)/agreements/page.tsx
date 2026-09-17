import Link from "next/link";
import type { AgreementStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isInternal } from "@/lib/rbac";
import { listAgreements } from "@/lib/agreements";
import {
  LIVE_STATE_CLASS,
  LIVE_STATE_LABEL,
  listTradeAgreements,
  stateOf,
  type LiveState,
} from "@/lib/trade-agreements";
import { money, shortDate, dateTime, STATUS_LABEL } from "@/lib/format";
import { ErpBadge, StatusBadge } from "@/components/StatusBadge";
import { EmptyState, Panel } from "@/components/Panel";

type SP = Record<string, string | undefined>;
type View = "requests" | "current";

export default async function AgreementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const internal = isInternal(user.role);
  const view: View = sp.view === "current" ? "current" : "requests";

  const actor = { id: user.id, email: user.email, role: user.role, vendorId: user.vendorId };

  const [vendors, legalEntities] = await Promise.all([
    internal ? prisma.vendor.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.legalEntity.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);

  const shared = {
    vendorId: sp.vendorId || undefined,
    dataAreaId: sp.dataAreaId || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    q: sp.q || undefined,
    page: sp.page ? Number(sp.page) : 1,
  };

  const requests =
    view === "requests"
      ? await listAgreements(actor, {
          ...shared,
          status: (sp.status as AgreementStatus) || undefined,
          erp: (sp.erp as "created" | "not_created") || undefined,
        })
      : null;

  const current =
    view === "current"
      ? await listTradeAgreements(actor, { ...shared, state: (sp.state as LiveState) || undefined })
      : null;

  const result = requests ?? current!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{internal ? "Review queue" : user.vendorName}</p>
          <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">
            {internal ? "All agreements" : "My agreements"}
          </h1>
          <p className="mt-1 text-sm text-charcoal/60">
            {result.total} record{result.total === 1 ? "" : "s"} match the current filters.
          </p>
        </div>
        {user.role === "VENDOR" ? (
          <div className="flex flex-wrap gap-3">
            <Link href="/agreements/upload" className="btn-ghost">Update prices in bulk</Link>
            <Link href="/agreements/new" className="btn-primary">New agreement</Link>
          </div>
        ) : null}
      </div>

      {/* Two sources of truth, kept apart on purpose: what has been asked for,
          and what Dynamics 365 currently holds. */}
      <nav className="flex gap-6 border-b border-line">
        <Tab href="/agreements" label="Portal requests" active={view === "requests"} />
        <Tab href="/agreements?view=current" label="Current in Dynamics 365" active={view === "current"} />
      </nav>

      <form className="panel grid gap-4 p-5 md:grid-cols-3 xl:grid-cols-6">
        {view === "current" ? <input type="hidden" name="view" value="current" /> : null}

        {internal ? (
          <div>
            <label className="field-label" htmlFor="vendorId">Vendor</label>
            <select id="vendorId" name="vendorId" defaultValue={shared.vendorId ?? ""} className="input">
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
              ))}
            </select>
          </div>
        ) : null}

        {view === "requests" ? (
          <>
            <div>
              <label className="field-label" htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={sp.status ?? ""} className="input">
                <option value="">Any status</option>
                {(Object.keys(STATUS_LABEL) as AgreementStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="erp">ERP state</label>
              <select id="erp" name="erp" defaultValue={sp.erp ?? ""} className="input">
                <option value="">Created and not created</option>
                <option value="created">Created in ERP</option>
                <option value="not_created">Not created in ERP</option>
              </select>
            </div>
          </>
        ) : (
          <div>
            <label className="field-label" htmlFor="state">Validity</label>
            <select id="state" name="state" defaultValue={sp.state ?? ""} className="input">
              <option value="">Any</option>
              <option value="active">In force today</option>
              <option value="scheduled">Starts later</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="dataAreaId">Legal entity</label>
          <select id="dataAreaId" name="dataAreaId" defaultValue={shared.dataAreaId ?? ""} className="input">
            <option value="">All entities</option>
            {legalEntities.map((le) => (
              <option key={le.code} value={le.code}>{le.code.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="from">
            {view === "requests" ? "Raised from" : "Valid from"}
          </label>
          <input id="from" name="from" type="date" defaultValue={shared.from ?? ""} className="input" />
        </div>

        <div>
          <label className="field-label" htmlFor="to">
            {view === "requests" ? "Raised to" : "Valid up to"}
          </label>
          <input id="to" name="to" type="date" defaultValue={shared.to ?? ""} className="input" />
        </div>

        <div className="md:col-span-2">
          <label className="field-label" htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            defaultValue={shared.q ?? ""}
            className="input"
            placeholder={view === "requests" ? "TA-2026-000012" : "Item number or account"}
          />
        </div>

        <div className="flex items-end gap-2 md:col-span-2">
          <button className="btn-primary">Apply filters</button>
          <Link href={view === "current" ? "/agreements?view=current" : "/agreements"} className="btn-ghost">
            Clear
          </Link>
        </div>
      </form>

      {view === "requests" ? (
        <Panel>
          {requests!.rows.length === 0 ? (
            <EmptyState
              title="Nothing here yet"
              body={
                user.role === "VENDOR"
                  ? "Raise your first agreement against an item to get it into review."
                  : "No agreements match these filters. Widen the date range or clear the status."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="border-b border-line bg-cloud/60">
                  <tr>
                    <th className="th">Reference</th>
                    {internal ? <th className="th">Vendor</th> : null}
                    <th className="th">Item</th>
                    <th className="th">Entity</th>
                    <th className="th">Amount</th>
                    <th className="th">Valid from</th>
                    <th className="th">Status</th>
                    <th className="th">ERP</th>
                    <th className="th">Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {requests!.rows.map((a) => (
                    <tr key={a.id} className="border-b border-line/60 last:border-0 hover:bg-cloud/50">
                      <td className="td">
                        <Link href={`/agreements/${a.id}`} className="font-semibold text-pink hover:underline">
                          {a.reference}
                        </Link>
                      </td>
                      {internal ? <td className="td">{a.vendor.name}</td> : null}
                      <td className="td">
                        <span className="font-medium">{a.itemNumber}</span>
                        {a.itemName ? <span className="block text-xs text-charcoal/60">{a.itemName}</span> : null}
                      </td>
                      <td className="td uppercase">{a.dataAreaId}</td>
                      <td className="td whitespace-nowrap">{money(a.amount, a.currency)}</td>
                      <td className="td whitespace-nowrap">{shortDate(a.fromDate)}</td>
                      <td className="td"><StatusBadge status={a.status} /></td>
                      <td className="td"><ErpBadge created={a.erpCreated} /></td>
                      <td className="td whitespace-nowrap text-xs text-charcoal/60">{dateTime(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel
          title="Live trade agreements"
          subtitle="Read only mirror of Dynamics 365, refreshed by the daily sync"
        >
          {current!.rows.length === 0 ? (
            <EmptyState
              title="No trade agreements"
              body={
                internal
                  ? "Run a trade agreement refresh from the integration page, or widen the filters."
                  : "Nothing is currently on record against your account. Anything you raise here appears once it is approved and synced."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="border-b border-line bg-cloud/60">
                  <tr>
                    <th className="th">Item</th>
                    {internal ? <th className="th">Vendor</th> : null}
                    <th className="th">Entity</th>
                    <th className="th">Amount</th>
                    <th className="th">Unit</th>
                    <th className="th">Valid from</th>
                    <th className="th">Valid to</th>
                    <th className="th">Validity</th>
                    <th className="th">Synced</th>
                  </tr>
                </thead>
                <tbody>
                  {current!.rows.map((ta) => {
                    const state = stateOf(ta.fromDate, ta.toDate);
                    return (
                      <tr key={ta.id} className="border-b border-line/60 last:border-0 hover:bg-cloud/50">
                        <td className="td">
                          <span className="font-medium">{ta.itemNumber}</span>
                          {ta.item?.productName ? (
                            <span className="block text-xs text-charcoal/60">{ta.item.productName}</span>
                          ) : null}
                        </td>
                        {internal ? (
                          <td className="td">
                            {ta.vendor?.name ?? (
                              <span className="text-xs text-charcoal/50">{ta.vendorCode ?? "Unmapped"}</span>
                            )}
                          </td>
                        ) : null}
                        <td className="td uppercase">{ta.dataAreaId}</td>
                        <td className="td whitespace-nowrap">{money(ta.amount, ta.currency)}</td>
                        <td className="td">{ta.unit ?? "-"}</td>
                        <td className="td whitespace-nowrap">{shortDate(ta.fromDate)}</td>
                        <td className="td whitespace-nowrap">{shortDate(ta.toDate)}</td>
                        <td className="td">
                          <span className={`badge ${LIVE_STATE_CLASS[state]}`}>{LIVE_STATE_LABEL[state]}</span>
                        </td>
                        <td className="td whitespace-nowrap text-xs text-charcoal/60">
                          {dateTime(ta.lastSyncedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {result.pages > 1 ? (
        <nav className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em]">
          <PageLink sp={sp} page={result.page - 1} disabled={result.page <= 1} label="Previous" />
          <span className="text-charcoal/50">Page {result.page} of {result.pages}</span>
          <PageLink sp={sp} page={result.page + 1} disabled={result.page >= result.pages} label="Next" />
        </nav>
      ) : null}
    </div>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 pb-3 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
        active ? "border-pink text-pink" : "border-transparent text-charcoal/50 hover:text-charcoal"
      }`}
    >
      {label}
    </Link>
  );
}

function PageLink({ sp, page, disabled, label }: { sp: SP; page: number; disabled: boolean; label: string }) {
  if (disabled) return <span className="text-charcoal/30">{label}</span>;
  const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  params.set("page", String(page));
  return (
    <Link href={`/agreements?${params.toString()}`} className="text-pink hover:underline">
      {label}
    </Link>
  );
}
