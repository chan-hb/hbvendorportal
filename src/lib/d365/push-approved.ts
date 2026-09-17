import { prisma } from "@/lib/prisma";
import { getD365Config } from "./config";
import { odataPost } from "./client";
import { finish } from "./sync-items";

/**
 * Pushes approved agreements into D365 and flags them as created in ERP.
 *
 * The target is a custom data entity (see /xpp) so that the payload is stable
 * and the ERP side owns the logic that turns a request into a price/discount
 * agreement journal. Point `pushEntity` at a different entity if you prefer to
 * write straight into a standard one.
 */
export async function pushApprovedAgreements(trigger: "manual" | "cron", triggeredBy?: string) {
  const cfg = await getD365Config();
  const run = await prisma.syncRun.create({ data: { type: "PUSH_APPROVED", trigger, triggeredBy } });

  const pending = await prisma.agreement.findMany({
    where: { status: "APPROVED", erpCreated: false, erpAttempts: { lt: 5 } },
    include: { vendor: true },
    orderBy: { decidedAt: "asc" },
    take: 200,
  });

  let processed = 0;
  let failed = 0;
  const problems: string[] = [];

  for (const agreement of pending) {
    try {
      const payload = buildPayload(agreement);
      const created = await odataPost<Record<string, unknown>>(cfg, cfg.pushEntity, payload);
      const erpRecordId =
        String(created["RequestNumber"] ?? created["RecId"] ?? created["JournalNumber"] ?? agreement.reference);

      await prisma.$transaction([
        prisma.agreement.update({
          where: { id: agreement.id },
          data: {
            erpCreated: true,
            erpRecordId,
            erpSyncedAt: new Date(),
            erpError: null,
            erpAttempts: { increment: 1 },
          },
        }),
        prisma.agreementHistory.create({
          data: {
            agreementId: agreement.id,
            action: "ERP_SYNC_SUCCEEDED",
            comment: `Created in D365 as ${erpRecordId}`,
            actorEmail: triggeredBy ?? "system",
            actorRole: "HB_ADMIN",
          },
        }),
      ]);
      processed += 1;
    } catch (err) {
      failed += 1;
      const message = (err as Error).message.slice(0, 1000);
      problems.push(`${agreement.reference}: ${message}`);
      await prisma.$transaction([
        prisma.agreement.update({
          where: { id: agreement.id },
          data: { erpError: message, erpAttempts: { increment: 1 } },
        }),
        prisma.agreementHistory.create({
          data: {
            agreementId: agreement.id,
            action: "ERP_SYNC_FAILED",
            comment: message,
            actorEmail: triggeredBy ?? "system",
            actorRole: "HB_ADMIN",
          },
        }),
      ]);
    }
  }

  return finish(run.id, processed, failed, problems);
}

type PushableAgreement = Awaited<ReturnType<typeof prisma.agreement.findMany>>[number] & {
  vendor: { code: string; name: string };
};

export function buildPayload(a: PushableAgreement) {
  return {
    dataAreaId: a.dataAreaId,
    RequestNumber: a.reference,
    VendorAccountNumber: a.vendor.code,
    ItemNumber: a.itemNumber,
    CurrencyCode: a.currency,
    Amount: Number(a.amount),
    UnitSymbol: a.unit ?? "",
    ValidFromDate: a.fromDate.toISOString().slice(0, 10),
    ValidToDate: a.toDate ? a.toDate.toISOString().slice(0, 10) : null,
    ApprovedBy: a.decidedBy ?? "",
    ApprovedDateTime: (a.decidedAt ?? new Date()).toISOString(),
    Notes: a.notes ?? "",
  };
}
