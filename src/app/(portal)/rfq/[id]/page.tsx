import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isInternal } from "@/lib/rbac";
import { compareRfq, getRfq, markInvitationViewed } from "@/lib/rfq/service";
import { explainWinner } from "@/lib/rfq/scoring";
import { dateTime, shortDate } from "@/lib/format";
import { Panel } from "@/components/Panel";
import { RfqInvite } from "@/components/RfqInvite";
import { BidForm } from "@/components/BidForm";
import { BidComparison } from "@/components/BidComparison";
import { RfqAttachments } from "@/components/RfqAttachments";
import { ProvisionalVendorForm } from "@/components/ProvisionalVendorForm";

export default async function RfqDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab } = await searchParams;
  const internal = isInternal(user.role);

  const actor = { id: user.id, email: user.email, role: user.role, vendorId: user.vendorId };
  const rfq = await getRfq(actor, id);
  if (!rfq) notFound();

  // Opening the page is the signal that a vendor has seen the invitation.
  if (!internal && user.vendorId) await markInvitationViewed(id, user.vendorId);

  const itemLabel = rfq.itemNumber ?? `${rfq.localItem?.localCode} . ${rfq.localItem?.name}`;
  const closed = rfq.status !== "OPEN" || rfq.closesAt < new Date();

  // ------------------------------------------------------------ vendor view
  if (!internal) {
    const myBid = await prisma.bid.findUnique({
      where: { rfqId_vendorId: { rfqId: id, vendorId: user.vendorId! } },
      include: { lines: { orderBy: { quantity: "asc" } } },
    });
    const invitation = rfq.invitations.find((i) => i.vendor.id === user.vendorId);

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Header rfq={rfq} itemLabel={itemLabel} />

        <Panel title="What is being sourced">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3">
            <Field label="Item" value={itemLabel} />
            <Field label="Quantity" value={`${Number(rfq.targetQuantity).toLocaleString()} ${rfq.unit ?? ""}`} />
            <Field label="Currency" value={rfq.currency} />
            <Field
              label="Price breaks wanted"
              value={rfq.quantityTiers.map((t) => Number(t).toLocaleString()).join(", ") || "As you see fit"}
            />
            <Field label="Quotations close" value={shortDate(rfq.closesAt)} />
            <Field label="Legal entity" value={rfq.dataAreaId.toUpperCase()} />
            <Field label="Payment terms sought" value={rfq.requestedPaymentTerms ?? "Tell us what you offer"} />
            <Field label="Incoterm sought" value={rfq.requestedIncoterm ?? "Tell us what you offer"} />
          </dl>
          {rfq.notes ? (
            <div className="border-t border-line px-5 py-4">
              <p className="field-label">Notes from the buyer</p>
              <p className="text-sm text-charcoal/80">{rfq.notes}</p>
            </div>
          ) : null}
        </Panel>

        {rfq.attachments.length > 0 ? (
          <Panel title="Brief and specifications">
            <RfqAttachments
              rfqId={id}
              canEdit={false}
              attachments={rfq.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
            />
          </Panel>
        ) : null}

        {invitation?.status === "DECLINED" ? (
          <Panel title="Your response">
            <p className="px-5 py-6 text-sm text-charcoal/70">
              You told us you are not quoting on this one{invitation.declineNote ? `: ${invitation.declineNote}` : "."} If
              that has changed, contact your Huda Beauty buyer.
            </p>
          </Panel>
        ) : (
          <Panel
            title="Your quotation"
            subtitle="Offer as many delivery tranches as you need, each with its own quantity, price and date"
          >
            <BidForm
              rfqId={id}
              currency={rfq.currency}
              unit={rfq.unit}
              targetQuantity={Number(rfq.targetQuantity)}
              quantityTiers={rfq.quantityTiers.map((t) => Number(t))}
              requestedPaymentTerms={rfq.requestedPaymentTerms}
              requestedIncoterm={rfq.requestedIncoterm}
              readOnly={closed && myBid?.status === "SUBMITTED"}
              existing={
                myBid
                  ? {
                      status: myBid.status,
                      notes: myBid.notes ?? "",
                      quotationDate: myBid.quotationDate?.toISOString().slice(0, 10) ?? "",
                      validUntil: myBid.validUntil?.toISOString().slice(0, 10) ?? "",
                      leadTimeDays: myBid.leadTimeDays !== null ? String(myBid.leadTimeDays) : "",
                      weeklyCapacity: myBid.weeklyCapacity !== null ? String(myBid.weeklyCapacity) : "",
                      moq: myBid.moq !== null ? String(myBid.moq) : "",
                      paymentTerms: myBid.paymentTerms ?? "",
                      incoterm: myBid.incoterm ?? "",
                      tiers: myBid.lines.map((l) => ({
                        quantity: Number(l.quantity),
                        unitPrice: String(l.unitPrice),
                        notes: l.notes ?? "",
                      })),
                    }
                  : undefined
              }
            />
          </Panel>
        )}

        {rfq.status === "AWARDED" ? (
          <Panel title="Outcome">
            <p className="px-5 py-6 text-sm text-charcoal/70">
              {rfq.awardedBidId && myBid?.id === rfq.awardedBidId
                ? "Your quotation was accepted. A buyer will be in touch."
                : "This RFQ has been awarded. Thank you for quoting."}
            </p>
          </Panel>
        ) : null}
      </div>
    );
  }

  // ------------------------------------------------------------ internal view
  const [{ bids, scores }, vendors, staff] = await Promise.all([
    compareRfq(id),
    prisma.vendor.findMany({
      where: { isActive: true },
      include: { _count: { select: { users: true, allowedEmails: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["HB_USER", "HB_APPROVER", "HB_ADMIN"] }, isActive: true },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    }),
  ]);

  const activeTab = tab ?? (scores.length > 0 ? "compare" : "vendors");

  return (
    <div className="space-y-6">
      <Header rfq={rfq} itemLabel={itemLabel} />

      <div className="grid gap-6 lg:grid-cols-[3fr_1fr]">
        <div className="space-y-6">
          <nav className="flex gap-6 border-b border-line">
            <Tab href={`/rfq/${id}?tab=vendors`} label={`Vendors (${rfq.invitations.length})`} active={activeTab === "vendors"} />
            <Tab href={`/rfq/${id}?tab=compare`} label={`Comparison (${bids.length})`} active={activeTab === "compare"} />
            <Tab href={`/rfq/${id}?tab=activity`} label="Activity" active={activeTab === "activity"} />
          </nav>

          {activeTab === "vendors" ? (
            <>
              <Panel title="Invited vendors">
                {rfq.invitations.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-charcoal/60">Nobody invited yet.</p>
                ) : (
                  <table className="w-full border-collapse">
                    <thead className="border-b border-line bg-cloud/60">
                      <tr>
                        <th className="th">Vendor</th>
                        <th className="th">Status</th>
                        <th className="th">Emailed</th>
                        <th className="th">Responded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rfq.invitations.map((i) => (
                        <tr key={i.id} className="border-b border-line/60 last:border-0">
                          <td className="td">
                            {i.vendor.name}
                            <span className="block text-xs text-charcoal/55">{i.vendor.code}</span>
                          </td>
                          <td className="td">
                            <span className="badge border-line bg-cloud text-charcoal/70">{i.status}</span>
                          </td>
                          <td className="td text-xs">
                            {i.emailSentAt ? (
                              <>
                                {dateTime(i.emailSentAt)}
                                <span className="block text-charcoal/50">{i.emailTo.join(", ")}</span>
                              </>
                            ) : (
                              <span className="text-[#A32B2B]">Not sent</span>
                            )}
                          </td>
                          <td className="td text-xs">
                            {i.respondedAt ? dateTime(i.respondedAt) : "-"}
                            {i.declineNote ? <span className="block text-charcoal/55">{i.declineNote}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>

              <Panel title="Add a supplier who is not in Dynamics 365">
                <ProvisionalVendorForm rfqId={id} />
              </Panel>

              <Panel title="Invite more vendors">
                <RfqInvite
                  rfqId={id}
                  vendors={vendors.map((v) => ({
                    id: v.id,
                    name: v.name,
                    code: v.code,
                    contactCount: v._count.users + v._count.allowedEmails,
                    invited: rfq.invitations.some((i) => i.vendor.id === v.id),
                  }))}
                  watchers={rfq.watchers.map((w) => ({ userId: w.userId, email: w.user.email }))}
                  staff={staff}
                />
              </Panel>
            </>
          ) : null}

          {activeTab === "compare" ? (
            <Panel title="Bid comparison">
              <BidComparison
                rfqId={id}
                currency={rfq.currency}
                unit={rfq.unit}
                targetQuantity={Number(rfq.targetQuantity)}
                recommendation={explainWinner(scores, rfq.currency)}
                canAward={rfq.status !== "CANCELLED"}
                awardedBidId={rfq.awardedBidId}
                scores={scores}
                bids={bids.map((b) => ({
                  id: b.id,
                  vendorName: b.vendor.name,
                  notes: b.notes,
                  quotationDate: b.quotationDate?.toISOString() ?? null,
                  validUntil: b.validUntil?.toISOString() ?? null,
                  incoterm: b.incoterm,
                }))}
              />
            </Panel>
          ) : null}

          {activeTab === "activity" ? (
            <Panel title="Activity">
              <ol className="divide-y divide-line/60">
                {rfq.events.map((e) => (
                  <li key={e.id} className="px-5 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em]">{e.type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-charcoal/60">
                      {e.actorEmail ?? "system"} . {dateTime(e.createdAt)}
                    </p>
                    {e.detail ? <p className="mt-1 text-sm text-charcoal/80">{e.detail}</p> : null}
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Panel title="Brief">
            <RfqAttachments
              rfqId={id}
              canEdit={rfq.status !== "AWARDED" && rfq.status !== "CANCELLED"}
              attachments={rfq.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
            />
          </Panel>

          <Panel title="Details">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-5">
              <Field label="Item" value={itemLabel} />
              <Field label="Entity" value={rfq.dataAreaId.toUpperCase()} />
              <Field label="Quantity" value={`${Number(rfq.targetQuantity).toLocaleString()} ${rfq.unit ?? ""}`} />
              <Field label="Currency" value={rfq.currency} />
              <Field label="Closes" value={shortDate(rfq.closesAt)} />
              <Field
                label="Breaks"
                value={rfq.quantityTiers.map((t) => Number(t).toLocaleString()).join(", ") || "None set"}
              />
              <Field label="Raised by" value={rfq.createdBy.email} />
              <Field
                label="All bids alert"
                value={rfq.allBidsInAlertSentAt ? dateTime(rfq.allBidsInAlertSentAt) : "Not sent yet"}
              />
            </dl>
          </Panel>

          <Panel title="Scoring weights">
            <ul className="space-y-2 p-5 text-sm">
              {[
                ["Price", rfq.weightPrice],
                ["Lead time", rfq.weightLeadTime],
                ["Capacity", rfq.weightCapacity],
                ["Track record", rfq.weightReliability],
              ].map(([label, w]) => (
                <li key={String(label)} className="flex items-center justify-between gap-3">
                  <span>{label}</span>
                  <span className="text-charcoal/60">{String(w)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          {rfq.awardReason ? (
            <Panel title="Award reason">
              <p className="px-5 py-4 text-sm text-charcoal/80">{rfq.awardReason}</p>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Header({ rfq, itemLabel }: { rfq: { reference: string; title: string; status: string }; itemLabel: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/rfq" className="text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal/50 hover:text-pink">
          Back to RFQs
        </Link>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight">{rfq.reference}</h1>
        <p className="mt-1 text-sm text-charcoal/60">{rfq.title} . {itemLabel}</p>
      </div>
      <span className="badge border-line bg-white text-charcoal">{rfq.status}</span>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className="text-sm font-medium text-charcoal">{value}</dd>
    </div>
  );
}
