import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canApprove, isInternal } from "@/lib/rbac";
import { getAgreement } from "@/lib/agreements";
import { currentPriceFor } from "@/lib/d365/sync-trade-agreements";
import { dateTime, money, shortDate } from "@/lib/format";
import { ErpBadge, StatusBadge } from "@/components/StatusBadge";
import { Panel } from "@/components/Panel";
import { DecisionPanel } from "@/components/DecisionPanel";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { AgreementForm } from "@/components/AgreementForm";
import { resubmitAction } from "@/app/actions/agreements";

export default async function AgreementDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const agreement = await getAgreement(
    { id: user.id, email: user.email, role: user.role, vendorId: user.vendorId },
    id,
  );
  if (!agreement) notFound();

  const live = await currentPriceFor(agreement.dataAreaId, agreement.itemNumber, agreement.vendor.code);
  const showApproval = canApprove(user.role) && agreement.status === "SUBMITTED";
  const vendorCanEdit =
    user.role === "VENDOR" && ["DRAFT", "CHANGE_REQUESTED"].includes(agreement.status);

  const legalEntities = await prisma.legalEntity.findMany({ where: { code: agreement.dataAreaId } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/agreements" className="text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal/50 hover:text-pink">
            Back to list
          </Link>
          <h1 className="mt-2 font-display text-3xl uppercase tracking-tight">{agreement.reference}</h1>
          <p className="mt-1 text-sm text-charcoal/60">
            {agreement.vendor.name} ({agreement.vendor.code}) . {agreement.dataAreaId.toUpperCase()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={agreement.status} />
          <ErpBadge created={agreement.erpCreated} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Panel title="Requested terms">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3">
              <Field label="Item" value={agreement.itemNumber} hint={agreement.itemName ?? undefined} />
              <Field label="Amount" value={money(agreement.amount, agreement.currency)} />
              <Field label="Unit" value={agreement.unit ?? "Not set"} />
              <Field label="Valid from" value={shortDate(agreement.fromDate)} />
              <Field label="Valid to" value={shortDate(agreement.toDate)} />
              <Field label="Raised by" value={agreement.createdBy.email} hint={dateTime(agreement.createdAt)} />
            </dl>
            {agreement.notes ? (
              <div className="border-t border-line px-5 py-4">
                <p className="field-label">Vendor notes</p>
                <p className="text-sm text-charcoal/80">{agreement.notes}</p>
              </div>
            ) : null}
          </Panel>

          {isInternal(user.role) ? (
            <Panel title="Price in Dynamics 365 today" subtitle="Pulled from the last trade agreement refresh">
              {live ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3">
                  <Field label="Current amount" value={money(live.amount, live.currency)} />
                  <Field label="Valid from" value={shortDate(live.fromDate)} />
                  <Field label="Valid to" value={shortDate(live.toDate)} />
                  <Field
                    label="Movement"
                    value={movement(Number(live.amount), Number(agreement.amount))}
                  />
                  <Field label="Last refreshed" value={dateTime(live.lastSyncedAt)} />
                </dl>
              ) : (
                <p className="px-5 py-6 text-sm text-charcoal/60">
                  No active trade agreement found for this item and vendor. This request would create the first one.
                </p>
              )}
            </Panel>
          ) : null}

          {showApproval ? (
            <Panel title="Your decision" subtitle="Approve, ask for a change, or reject with a reason">
              <DecisionPanel agreementId={agreement.id} />
            </Panel>
          ) : null}

          {vendorCanEdit ? (
            <Panel title="Update and resubmit">
              <div className="p-5">
                <AgreementForm
                  mode="edit"
                  action={resubmitAction}
                  legalEntities={legalEntities.map((le) => ({ code: le.code, name: le.name, currency: le.currency }))}
                  currencies={[agreement.currency, "AED", "USD", "EUR", "GBP"].filter(
                    (v, i, arr) => arr.indexOf(v) === i,
                  )}
                  initial={{
                    id: agreement.id,
                    dataAreaId: agreement.dataAreaId,
                    itemNumber: agreement.itemNumber,
                    currency: agreement.currency,
                    amount: String(agreement.amount),
                    unit: agreement.unit ?? "",
                    fromDate: agreement.fromDate.toISOString().slice(0, 10),
                    toDate: agreement.toDate ? agreement.toDate.toISOString().slice(0, 10) : "",
                    notes: agreement.notes ?? "",
                  }}
                />
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-6">
          <Panel title="ERP status">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5">
              <Field label="Created in ERP" value={agreement.erpCreated ? "Yes" : "No"} />
              <Field label="ERP record" value={agreement.erpRecordId ?? "Not assigned"} />
              <Field label="Synced" value={agreement.erpSyncedAt ? dateTime(agreement.erpSyncedAt) : "Pending"} />
              <Field label="Attempts" value={String(agreement.erpAttempts)} />
            </dl>
            {agreement.erpError ? (
              <p className="border-t border-line bg-[#FBEAEA] px-5 py-3 text-xs text-[#A32B2B]">
                {agreement.erpError}
              </p>
            ) : null}
          </Panel>

          <Panel
            title="History"
            subtitle="Every submission, decision and sync attempt"
            actions={
              <Link
                href={`/price-history?itemNumber=${encodeURIComponent(agreement.itemNumber)}&dataAreaId=${agreement.dataAreaId}`}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-pink hover:underline"
              >
                Price history
              </Link>
            }
          >
            <HistoryTimeline entries={agreement.history} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className="text-sm font-medium text-charcoal">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-charcoal/55">{hint}</p> : null}
    </div>
  );
}

function movement(current: number, proposed: number) {
  if (!current) return "New price";
  const pct = ((proposed - current) / current) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)} percent`;
}
