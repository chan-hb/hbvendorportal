import type { AgreementStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canApprove, isInternal } from "@/lib/rbac";
import { nextReference } from "@/lib/reference";
import { currentPriceFor } from "@/lib/d365/sync-trade-agreements";
import type { AgreementInput } from "@/lib/validation";

export type Actor = { id: string; email: string; role: Role; vendorId: string | null };

export type AgreementFilters = {
  vendorId?: string;
  status?: AgreementStatus;
  erp?: "created" | "not_created";
  dataAreaId?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

/**
 * The single scoping rule for the whole app: a vendor user can only ever see
 * rows belonging to their own vendor. Internal users see everything and may
 * narrow by vendor themselves.
 */
export function scopeFor(actor: Actor, filters: AgreementFilters): Prisma.AgreementWhereInput {
  const where: Prisma.AgreementWhereInput = {};

  if (isInternal(actor.role)) {
    if (filters.vendorId) where.vendorId = filters.vendorId;
  } else {
    if (!actor.vendorId) return { id: "__no_access__" };
    where.vendorId = actor.vendorId;
  }

  if (filters.status) where.status = filters.status;
  if (filters.dataAreaId) where.dataAreaId = filters.dataAreaId;
  if (filters.erp === "created") where.erpCreated = true;
  if (filters.erp === "not_created") where.erpCreated = false;

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
    };
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { itemNumber: { contains: q, mode: "insensitive" } },
      { itemName: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function listAgreements(actor: Actor, filters: AgreementFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);
  const where = scopeFor(actor, filters);

  const [rows, total] = await Promise.all([
    prisma.agreement.findMany({
      where,
      include: { vendor: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.agreement.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAgreement(actor: Actor, id: string) {
  const agreement = await prisma.agreement.findUnique({
    where: { id },
    include: {
      vendor: true,
      createdBy: { select: { email: true, name: true } },
      history: { orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!agreement) return null;
  if (!isInternal(actor.role) && agreement.vendorId !== actor.vendorId) return null;
  return agreement;
}

// ------------------------------------------------------------------ mutations

export async function createAgreement(actor: Actor, input: AgreementInput, submit: boolean) {
  if (actor.role !== "VENDOR" || !actor.vendorId) throw new Error("Only vendor users can raise agreements");

  const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: actor.vendorId } });
  const item = await prisma.item.findUnique({
    where: { dataAreaId_itemNumber: { dataAreaId: input.dataAreaId, itemNumber: input.itemNumber } },
  });
  if (!item) throw new Error(`Item ${input.itemNumber} does not exist in ${input.dataAreaId.toUpperCase()}`);

  // An item is actively supplied by exactly one vendor, taken from the default
  // vendor column on the D365 item master. Anything else is refused, so a
  // supplier cannot price an item that is not theirs even by guessing the number.
  if (!item.primaryVendorCode) {
    throw new Error(
      `Item ${item.itemNumber} has no default vendor in Dynamics 365. Ask your Huda Beauty contact to set one.`,
    );
  }
  if (item.primaryVendorCode !== vendor.code) {
    throw new Error(`Item ${item.itemNumber} is not supplied by your account`);
  }

  const current = await currentPriceFor(input.dataAreaId, input.itemNumber, vendor.code);
  const legalEntity = await prisma.legalEntity.findUnique({ where: { code: input.dataAreaId } });
  const reference = await nextReference();
  const status: AgreementStatus = submit ? "SUBMITTED" : "DRAFT";

  return prisma.agreement.create({
    data: {
      reference,
      status,
      vendorId: vendor.id,
      dataAreaId: input.dataAreaId,
      legalEntityId: legalEntity?.id,
      itemNumber: input.itemNumber,
      itemName: item.productName,
      currency: input.currency,
      amount: input.amount,
      unit: input.unit ?? item.unit,
      fromDate: input.fromDate,
      toDate: input.toDate ?? null,
      notes: input.notes,
      previousAmount: current?.amount ?? null,
      previousCurrency: current?.currency ?? null,
      createdById: actor.id,
      submittedAt: submit ? new Date() : null,
      history: {
        create: {
          action: submit ? "SUBMITTED" : "CREATED",
          toStatus: status,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          comment: input.notes,
        },
      },
    },
  });
}

/** Vendor re-submits after a change request, or submits a saved draft. */
export async function resubmit(actor: Actor, id: string, input: AgreementInput) {
  const existing = await getAgreement(actor, id);
  if (!existing) throw new Error("Agreement not found");
  if (existing.vendorId !== actor.vendorId) throw new Error("Not your agreement");
  if (!["DRAFT", "CHANGE_REQUESTED"].includes(existing.status))
    throw new Error("This agreement can no longer be edited");

  return prisma.agreement.update({
    where: { id },
    data: {
      currency: input.currency,
      amount: input.amount,
      unit: input.unit,
      fromDate: input.fromDate,
      toDate: input.toDate ?? null,
      notes: input.notes,
      status: "SUBMITTED",
      submittedAt: new Date(),
      history: {
        create: {
          action: existing.status === "CHANGE_REQUESTED" ? "RESUBMITTED" : "SUBMITTED",
          fromStatus: existing.status,
          toStatus: "SUBMITTED",
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          comment: input.notes,
          snapshot: { amount: Number(input.amount), currency: input.currency },
        },
      },
    },
  });
}

const DECISION_MAP = {
  APPROVE: { status: "APPROVED" as AgreementStatus, action: "APPROVED" as const },
  REJECT: { status: "REJECTED" as AgreementStatus, action: "REJECTED" as const },
  REQUEST_CHANGE: { status: "CHANGE_REQUESTED" as AgreementStatus, action: "CHANGE_REQUESTED" as const },
};

export async function decide(
  actor: Actor,
  agreementId: string,
  decision: keyof typeof DECISION_MAP,
  comment?: string,
) {
  if (!canApprove(actor.role)) throw new Error("You do not have approval rights");

  const existing = await prisma.agreement.findUniqueOrThrow({ where: { id: agreementId } });
  if (existing.status !== "SUBMITTED") throw new Error("Only submitted agreements can be actioned");

  const target = DECISION_MAP[decision];

  return prisma.agreement.update({
    where: { id: agreementId },
    data: {
      status: target.status,
      decidedAt: new Date(),
      decidedBy: actor.email,
      history: {
        create: {
          action: target.action,
          fromStatus: existing.status,
          toStatus: target.status,
          comment,
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          snapshot: {
            amount: Number(existing.amount),
            currency: existing.currency,
            fromDate: existing.fromDate,
          },
        },
      },
    },
  });
}
