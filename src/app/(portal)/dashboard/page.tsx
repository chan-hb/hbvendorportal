import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/lib/session";
import { dateTime, money, shortDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { Panel } from "@/components/Panel";

export default async function Dashboard() {
  await requireInternal();
  const now = new Date();

  const [
    awaiting,
    changeRequested,
    approvedNotInErp,
    liveAgreements,
    openRfqs,
    awaitingQuotes,
    readyToCompare,
    awardedThisYear,
    recentAgreements,
    rfqsNeedingAttention,
    lastRuns,
  ] = await Promise.all([
    prisma.agreement.count({ where: { status: "SUBMITTED" } }),
    prisma.agreement.count({ where: { status: "CHANGE_REQUESTED" } }),
    prisma.agreement.count({ where: { status: "APPROVED", erpCreated: false } }),
    prisma.tradeAgreement.count(),

    prisma.rfq.count({ where: { status: "OPEN" } }),
    // Open, and at least one invited vendor has not answered yet.
    prisma.rfq.count({
      where: { status: "OPEN", invitations: { some: { status: { in: ["INVITED", "VIEWED"] } } } },
    }),
    // Everyone has answered, but nobody has awarded it.
    prisma.rfq.count({
      where: {
        status: { in: ["OPEN", "CLOSED"] },
        awardedBidId: null,
        bids: { some: { status: "SUBMITTED" } },
        invitations: { none: { status: { in: ["INVITED", "VIEWED"] } } },
      },
    }),
    prisma.rfq.count({
      where: { status: "AWARDED", awardedAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) } },
    }),

    prisma.agreement.findMany({
      where: { status: "SUBMITTED" },
      include: { vendor: { select: { name: true } } },
      orderBy: { submittedAt: "asc" },
      take: 6,
    }),
    prisma.rfq.findMany({
      where: { status: { in: ["OPEN", "CLOSED"] }, awardedBidId: null },
      include: {
        localItem: { select: { name: true } },
        invitations: { select: { status: true } },
        _count: { select: { bids: true } },
      },
      orderBy: { closesAt: "asc" },
      take: 6,
    }),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 4 }),
  ]);

  const agreementTiles = [
    { label: "Awaiting approval", value: awaiting, href: "/agreements?status=SUBMITTED", accent: true },
    { label: "Change requested", value: changeRequested, href: "/agreements?status=CHANGE_REQUESTED" },
    { label: "Approved, not in ERP", value: approvedNotInErp, href: "/agreements?status=APPROVED&erp=not_created" },
    { label: "Live in Dynamics 365", value: liveAgreements, href: "/agreements?view=current" },
  ];

  const rfqTiles = [
    { label: "Ready to compare", value: readyToCompare, href: "/rfq", accent: true },
    { label: "Open RFQs", value: openRfqs, href: "/rfq?status=OPEN" },
    { label: "Waiting on vendors", value: awaitingQuotes, href: "/rfq?status=OPEN" },
    { label: "Awarded this year", value: awardedThisYear, href: "/rfq?status=AWARDED" },
  ];

  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow">Overview</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">Dashboard</h1>
      </div>

      {/* Sourcing first: an RFQ with every quote in is the thing most likely
          to be holding someone up. */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Requests for quotation</h2>
          <Link href="/rfq/new" className="text-[11px] font-bold uppercase tracking-[0.12em] text-pink hover:underline">
            New RFQ
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {rfqTiles.map((t) => (
            <Tile key={t.label} {...t} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Trade agreements</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {agreementTiles.map((t) => (
            <Tile key={t.label} {...t} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="RFQs needing a decision" subtitle="Soonest closing date first">
          {rfqsNeedingAttention.length === 0 ? (
            <p className="px-5 py-10 text-sm text-charcoal/60">Nothing open.</p>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {rfqsNeedingAttention.map((r) => {
                  const outstanding = r.invitations.filter(
                    (i) => i.status === "INVITED" || i.status === "VIEWED",
                  ).length;
                  const overdue = r.closesAt < now;
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0">
                      <td className="td">
                        <Link href={`/rfq/${r.id}`} className="font-semibold text-pink hover:underline">
                          {r.reference}
                        </Link>
                        <span className="block text-xs text-charcoal/60">{r.title}</span>
                      </td>
                      <td className="td text-sm">
                        {r.itemNumber ?? r.localItem?.name ?? ""}
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        {shortDate(r.closesAt)}
                        {overdue ? <span className="block text-nude">Past closing</span> : null}
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        {r._count.bids} quoted
                        {outstanding > 0 ? (
                          <span className="block text-charcoal/55">{outstanding} outstanding</span>
                        ) : (
                          <span className="block text-[#2C6B44]">All in</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Agreements awaiting approval" subtitle="Oldest first">
          {recentAgreements.length === 0 ? (
            <p className="px-5 py-10 text-sm text-charcoal/60">The queue is clear.</p>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {recentAgreements.map((a) => (
                  <tr key={a.id} className="border-b border-line/60 last:border-0">
                    <td className="td">
                      <Link href={`/agreements/${a.id}`} className="font-semibold text-pink hover:underline">
                        {a.reference}
                      </Link>
                      <span className="block text-xs text-charcoal/60">{a.vendor.name}</span>
                    </td>
                    <td className="td text-sm">{a.itemNumber}</td>
                    <td className="td whitespace-nowrap text-sm">{money(a.amount, a.currency)}</td>
                    <td className="td"><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="Recent syncs">
        <ul className="divide-y divide-line/60">
          {lastRuns.length === 0 ? (
            <li className="px-5 py-8 text-sm text-charcoal/60">No sync has run yet.</li>
          ) : (
            lastRuns.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em]">{r.type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-charcoal/60">
                    {dateTime(r.startedAt)} . {r.trigger} . {r.processed} processed
                  </p>
                  {r.message ? <p className="mt-1 text-xs text-[#A32B2B]">{r.message.slice(0, 160)}</p> : null}
                </div>
                <span className="badge border-line bg-cloud text-charcoal/70">{r.status}</span>
              </li>
            ))
          )}
        </ul>
      </Panel>
    </div>
  );
}

function Tile({ label, value, href, accent }: { label: string; value: number; href: string; accent?: boolean }) {
  return (
    <Link href={href} className={`panel block p-5 transition hover:border-pink ${accent ? "border-pink/40" : ""}`}>
      <p className="field-label">{label}</p>
      <p className={`font-display text-4xl tracking-tight ${accent ? "text-pink" : "text-charcoal"}`}>{value}</p>
    </Link>
  );
}
