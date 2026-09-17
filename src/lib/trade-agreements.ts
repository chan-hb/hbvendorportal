import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isInternal } from "@/lib/rbac";
import type { Actor } from "@/lib/agreements";

export type TradeAgreementFilters = {
  vendorId?: string;
  dataAreaId?: string;
  state?: "active" | "scheduled" | "expired";
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

/** Derived from the validity dates, since D365 has no status on these rows. */
export type LiveState = "active" | "scheduled" | "expired";

export function stateOf(fromDate: Date | null, toDate: Date | null, now = new Date()): LiveState {
  if (fromDate && fromDate > now) return "scheduled";
  if (toDate && toDate < now) return "expired";
  return "active";
}

export const LIVE_STATE_LABEL: Record<LiveState, string> = {
  active: "In force",
  scheduled: "Starts later",
  expired: "Expired",
};

export const LIVE_STATE_CLASS: Record<LiveState, string> = {
  active: "bg-[#EAF4EE] text-[#2C6B44] border-[#2C6B44]/25",
  scheduled: "bg-pink-50 text-pink-600 border-pink/30",
  expired: "bg-cloud text-charcoal/60 border-line",
};

/**
 * Same rule as portal agreements: a vendor sees only rows resolved to their own
 * vendor id. That id is set during sync from the account on the agreement, or
 * from the item's default vendor when the agreement sits against a group.
 */
export function tradeAgreementScope(
  actor: Actor,
  filters: TradeAgreementFilters,
): Prisma.TradeAgreementWhereInput {
  const where: Prisma.TradeAgreementWhereInput = {};
  const now = new Date();

  if (isInternal(actor.role)) {
    if (filters.vendorId) where.vendorId = filters.vendorId;
  } else {
    if (!actor.vendorId) return { id: "__no_access__" };
    where.vendorId = actor.vendorId;
  }

  if (filters.dataAreaId) where.dataAreaId = filters.dataAreaId;

  if (filters.state === "active") {
    where.AND = [
      { OR: [{ fromDate: null }, { fromDate: { lte: now } }] },
      { OR: [{ toDate: null }, { toDate: { gte: now } }] },
    ];
  } else if (filters.state === "scheduled") {
    where.fromDate = { gt: now };
  } else if (filters.state === "expired") {
    where.toDate = { lt: now };
  }

  // Dates on this tab filter the validity start, not a creation timestamp,
  // because that is the date a buyer is actually looking for.
  if (filters.from || filters.to) {
    where.fromDate = {
      ...(typeof where.fromDate === "object" && where.fromDate !== null ? where.fromDate : {}),
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
    };
  }

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { itemNumber: { contains: q, mode: "insensitive" } },
      { vendorCode: { contains: q, mode: "insensitive" } },
      { item: { productName: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

export async function listTradeAgreements(actor: Actor, filters: TradeAgreementFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 25);
  const where = tradeAgreementScope(actor, filters);

  const [rows, total] = await Promise.all([
    prisma.tradeAgreement.findMany({
      where,
      include: {
        vendor: { select: { code: true, name: true } },
        item: { select: { productName: true } },
      },
      orderBy: [{ fromDate: "desc" }, { itemNumber: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.tradeAgreement.count({ where }),
  ]);

  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
