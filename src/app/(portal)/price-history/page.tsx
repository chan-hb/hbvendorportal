import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isInternal } from "@/lib/rbac";
import { priceHistory } from "@/lib/agreements-history";
import { dateTime, money, shortDate } from "@/lib/format";
import { EmptyState, Panel } from "@/components/Panel";

export default async function PriceHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ itemNumber?: string; vendorId?: string; dataAreaId?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const internal = isInternal(user.role);

  const [entries, vendors, legalEntities] = await Promise.all([
    priceHistory({ id: user.id, email: user.email, role: user.role, vendorId: user.vendorId }, sp),
    internal ? prisma.vendor.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.legalEntity.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Trade agreements</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">Price history</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Every price on record, from Dynamics 365 and from decided portal requests, in one chronology. The change
          column compares each price with the one it replaced for that item, vendor and entity.
        </p>
      </div>

      <form className="panel grid gap-4 p-5 md:grid-cols-3 xl:grid-cols-6">
        <div className="xl:col-span-2">
          <label className="field-label" htmlFor="itemNumber">Item</label>
          <input id="itemNumber" name="itemNumber" defaultValue={sp.itemNumber ?? ""} className="input" placeholder="ITM-0001" />
        </div>
        {internal ? (
          <div className="xl:col-span-2">
            <label className="field-label" htmlFor="vendorId">Vendor</label>
            <select id="vendorId" name="vendorId" defaultValue={sp.vendorId ?? ""} className="input">
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.code})</option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="field-label" htmlFor="dataAreaId">Legal entity</label>
          <select id="dataAreaId" name="dataAreaId" defaultValue={sp.dataAreaId ?? ""} className="input">
            <option value="">All</option>
            {legalEntities.map((le) => (
              <option key={le.code} value={le.code}>{le.code.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="from">Effective from</label>
          <input id="from" name="from" type="date" defaultValue={sp.from ?? ""} className="input" />
        </div>
        <div>
          <label className="field-label" htmlFor="to">Effective to</label>
          <input id="to" name="to" type="date" defaultValue={sp.to ?? ""} className="input" />
        </div>
        <div className="flex items-end">
          <button className="btn-primary">Apply</button>
        </div>
      </form>

      <Panel>
        {entries.length === 0 ? (
          <EmptyState title="Nothing on record" body="Narrow or clear the filters, or run a trade agreement refresh." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-line bg-cloud/60">
                <tr>
                  <th className="th">Effective</th>
                  <th className="th">Item</th>
                  {internal ? <th className="th">Vendor</th> : null}
                  <th className="th">Entity</th>
                  <th className="th">Price</th>
                  <th className="th">Change</th>
                  <th className="th">Valid to</th>
                  <th className="th">Source</th>
                  <th className="th">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={`${e.source}-${e.id}`} className="border-b border-line/60 last:border-0">
                    <td className="td whitespace-nowrap">{shortDate(e.fromDate)}</td>
                    <td className="td">
                      <span className="font-medium">{e.itemNumber}</span>
                      {e.itemName ? <span className="block text-xs text-charcoal/55">{e.itemName}</span> : null}
                    </td>
                    {internal ? <td className="td text-sm">{e.vendorName ?? e.vendorCode ?? "-"}</td> : null}
                    <td className="td uppercase">{e.dataAreaId}</td>
                    <td className="td whitespace-nowrap">{money(e.amount, e.currency)}</td>
                    <td className="td whitespace-nowrap">
                      {e.changePercent === null ? (
                        <span className="text-xs text-charcoal/45">First on record</span>
                      ) : (
                        <span className={e.changePercent > 0 ? "text-[#A32B2B]" : e.changePercent < 0 ? "text-[#2C6B44]" : ""}>
                          {e.changePercent > 0 ? "+" : ""}{e.changePercent.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap">{shortDate(e.toDate)}</td>
                    <td className="td">
                      {e.source === "D365" ? (
                        <span className="badge border-line bg-cloud text-charcoal/60">Dynamics 365</span>
                      ) : (
                        <span
                          className={`badge ${
                            e.status === "REJECTED"
                              ? "border-[#A32B2B]/25 bg-[#FBEAEA] text-[#A32B2B]"
                              : "border-pink/30 bg-pink-50 text-pink-600"
                          }`}
                        >
                          {e.status === "REJECTED" ? `${e.reference} rejected` : e.reference}
                        </span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-charcoal/55">{dateTime(e.recordedAt)}</td>
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
