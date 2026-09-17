import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isInternal } from "@/lib/rbac";
import { money, shortDate, dateTime } from "@/lib/format";
import { EmptyState, Panel } from "@/components/Panel";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dataAreaId?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim();

  // A vendor sees only the items they are the default vendor for.
  const vendorScope = isInternal(user.role) ? {} : { primaryVendorId: user.vendorId ?? "__none__" };

  const [items, legalEntities, lastRun] = await Promise.all([
    prisma.item.findMany({
      where: {
        isActive: true,
        ...vendorScope,
        ...(sp.dataAreaId ? { dataAreaId: sp.dataAreaId } : {}),
        ...(q
          ? {
              OR: [
                { itemNumber: { contains: q, mode: "insensitive" } },
                { productName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        primaryVendor: { select: { code: true, name: true } },
        tradeAgreements: {
          // A vendor only ever sees the trade agreements resolved to their own
          // vendor record, which is the same rule the agreements page applies.
          where: isInternal(user.role) ? {} : { vendorId: user.vendorId ?? "__none__" },
          orderBy: { fromDate: "desc" },
          take: 3,
        },
      },
      orderBy: { itemNumber: "asc" },
      take: 100,
    }),
    prisma.legalEntity.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.syncRun.findFirst({ where: { type: "ITEMS" }, orderBy: { startedAt: "desc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Dynamics 365 master data</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">Item master</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Read only mirror of released products and their current trade agreements.
          {isInternal(user.role)
            ? " Default vendor comes from the item master."
            : " These are the items your account is the default vendor for."}
          {lastRun ? ` Last refreshed ${dateTime(lastRun.startedAt)}.` : " Not yet refreshed."}
        </p>
      </div>

      <form className="panel flex flex-wrap items-end gap-4 p-5">
        <div className="min-w-[220px] flex-1">
          <label className="field-label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q ?? ""} className="input" placeholder="Item number or name" />
        </div>
        <div className="min-w-[160px]">
          <label className="field-label" htmlFor="dataAreaId">Legal entity</label>
          <select id="dataAreaId" name="dataAreaId" defaultValue={sp.dataAreaId ?? ""} className="input">
            <option value="">All entities</option>
            {legalEntities.map((le) => (
              <option key={le.code} value={le.code}>{le.code.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary">Search</button>
      </form>

      <Panel>
        {items.length === 0 ? (
          <EmptyState
            title="No items"
            body={
              isInternal(user.role)
                ? "Run an item refresh from the integration page, or widen your search."
                : "No items are currently assigned to your account as default vendor. Contact your Huda Beauty buyer if that looks wrong."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-line bg-cloud/60">
                <tr>
                  <th className="th">Item</th>
                  <th className="th">Entity</th>
                  {isInternal(user.role) ? <th className="th">Default vendor</th> : null}
                  <th className="th">Unit</th>
                  <th className="th">Current trade agreements</th>
                  <th className="th">Synced</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line/60 last:border-0">
                    <td className="td">
                      <span className="font-medium">{item.itemNumber}</span>
                      <span className="block text-xs text-charcoal/60">{item.productName}</span>
                    </td>
                    <td className="td uppercase">{item.dataAreaId}</td>
                    {isInternal(user.role) ? (
                      <td className="td">
                        {item.primaryVendor ? (
                          <>
                            <span className="text-sm">{item.primaryVendor.name}</span>
                            <span className="block text-xs text-charcoal/60">{item.primaryVendor.code}</span>
                          </>
                        ) : item.primaryVendorCode ? (
                          <span className="text-xs text-[#A32B2B]">
                            {item.primaryVendorCode} not in vendor master
                          </span>
                        ) : (
                          <span className="text-xs text-charcoal/50">None set</span>
                        )}
                      </td>
                    ) : null}
                    <td className="td">{item.unit ?? "-"}</td>
                    <td className="td">
                      {item.tradeAgreements.length === 0 ? (
                        <span className="text-xs text-charcoal/50">None on record</span>
                      ) : (
                        <ul className="space-y-1">
                          {item.tradeAgreements.map((ta) => (
                            <li key={ta.id} className="text-xs">
                              <span className="font-semibold">{money(ta.amount, ta.currency)}</span>
                              <span className="text-charcoal/60">
                                {" "}from {shortDate(ta.fromDate)}
                                {ta.vendorCode ? ` . ${ta.vendorCode}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-charcoal/60">{dateTime(item.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
