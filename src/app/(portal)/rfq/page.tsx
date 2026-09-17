import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isInternal } from "@/lib/rbac";
import { listRfqs } from "@/lib/rfq/service";
import { shortDate } from "@/lib/format";
import { EmptyState, Panel } from "@/components/Panel";

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-cloud text-charcoal border-line",
  OPEN: "bg-pink-50 text-pink-600 border-pink/30",
  CLOSED: "bg-[#FBF0E8] text-nude border-nude/40",
  AWARDED: "bg-[#EAF4EE] text-[#2C6B44] border-[#2C6B44]/25",
  CANCELLED: "bg-[#FBEAEA] text-[#A32B2B] border-[#A32B2B]/25",
};

export default async function RfqListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const internal = isInternal(user.role);

  const rfqs = await listRfqs(
    { id: user.id, email: user.email, role: user.role, vendorId: user.vendorId },
    { status: sp.status, q: sp.q },
  );

  // For a vendor, the useful thing is whether they still owe a response.
  const myInvitations = user.vendorId
    ? await prisma.rfqInvitation.findMany({
        where: { vendorId: user.vendorId, rfqId: { in: rfqs.map((r) => r.id) } },
        select: { rfqId: true, status: true },
      })
    : [];
  const myStatus = new Map<string, string>(
    myInvitations.map((i) => [i.rfqId, String(i.status)]),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Sourcing</p>
          <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">
            {internal ? "Requests for quotation" : "Invitations to quote"}
          </h1>
          <p className="mt-1 text-sm text-charcoal/60">
            {internal
              ? "Invite vendors, collect quotations, compare and award."
              : "RFQs you have been invited to. Quote with as many delivery tranches as you need."}
          </p>
        </div>
        {internal ? (
          <Link href="/rfq/new" className="btn-primary">New RFQ</Link>
        ) : null}
      </div>

      <form className="panel flex flex-wrap items-end gap-4 p-5">
        <div className="min-w-[200px]">
          <label className="field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="input">
            <option value="">Any status</option>
            {["DRAFT", "OPEN", "CLOSED", "AWARDED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="field-label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Reference, title or item" />
        </div>
        <button className="btn-primary">Apply</button>
        <Link href="/rfq" className="btn-ghost">Clear</Link>
      </form>

      <Panel>
        {rfqs.length === 0 ? (
          <EmptyState
            title="Nothing here"
            body={internal ? "Raise an RFQ to start collecting quotations." : "You have not been invited to quote yet."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-line bg-cloud/60">
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Title</th>
                  <th className="th">Item</th>
                  <th className="th">Quantity</th>
                  <th className="th">Required by</th>
                  <th className="th">Closes</th>
                  <th className="th">{internal ? "Quotes in" : "Your response"}</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-cloud/50">
                    <td className="td">
                      <Link href={`/rfq/${r.id}`} className="font-semibold text-pink hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="td">{r.title}</td>
                    <td className="td">
                      {r.itemNumber ?? r.localItem?.localCode ?? ""}
                      {r.localItem ? (
                        <span className="block text-xs text-charcoal/55">
                          {r.localItem.name}
                          {r.localItem.erpItemNumber ? ` . ERP ${r.localItem.erpItemNumber}` : " . not in ERP yet"}
                        </span>
                      ) : null}
                    </td>
                    <td className="td whitespace-nowrap">
                      {Number(r.targetQuantity).toLocaleString()} {r.unit ?? ""}
                    </td>
                    <td className="td whitespace-nowrap">{shortDate(r.requiredByDate)}</td>
                    <td className="td whitespace-nowrap">
                      {shortDate(r.closesAt)}
                      {r.status === "OPEN" && r.closesAt < new Date() ? (
                        <span className="block text-xs text-nude">Past closing</span>
                      ) : null}
                    </td>
                    <td className="td">
                      {internal
                        ? `${r.bids.length} of ${r._count.invitations}`
                        : label(myStatus.get(r.id))}
                    </td>
                    <td className="td">
                      <span className={`badge ${STATUS_CLASS[r.status] ?? ""}`}>{r.status}</span>
                    </td>
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

function label(status?: string) {
  return (
    { INVITED: "Not started", VIEWED: "Opened", SUBMITTED: "Submitted", DECLINED: "Declined" } as Record<string, string>
  )[status ?? ""] ?? "-";
}
