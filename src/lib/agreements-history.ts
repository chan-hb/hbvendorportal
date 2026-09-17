import { prisma } from "@/lib/prisma";
import { isInternal } from "@/lib/rbac";
import type { Actor } from "@/lib/agreements";

/**
 * Price history for an item and vendor.
 *
 * Two sources have to be woven together to tell the story: agreements that came
 * from D365, and portal requests that were approved here. Neither alone answers
 * "what has this cost us over time", which is the question being asked.
 */

export type HistoryEntry = {
  id: string;
  source: "D365" | "PORTAL";
  itemNumber: string;
  itemName: string | null;
  vendorName: string | null;
  vendorCode: string | null;
  dataAreaId: string;
  currency: string;
  amount: number;
  fromDate: Date | null;
  toDate: Date | null;
  reference: string | null;
  status: string | null;
  recordedAt: Date;
  /** Percentage change against the previous price for the same item and entity. */
  changePercent: number | null;
};

export type HistoryFilters = {
  itemNumber?: string;
  vendorId?: string;
  dataAreaId?: string;
  from?: string;
  to?: string;
};

export async function priceHistory(actor: Actor, filters: HistoryFilters): Promise<HistoryEntry[]> {
  const vendorScope = isInternal(actor.role) ? {} : { vendorId: actor.vendorId ?? "__none__" };

  const dateRange =
    filters.from || filters.to
      ? {
          gte: filters.from ? new Date(filters.from) : undefined,
          lte: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined,
        }
      : undefined;

  const [synced, portal] = await Promise.all([
    prisma.tradeAgreement.findMany({
      where: {
        ...vendorScope,
        ...(filters.vendorId && isInternal(actor.role) ? { vendorId: filters.vendorId } : {}),
        ...(filters.itemNumber ? { itemNumber: { contains: filters.itemNumber, mode: "insensitive" } } : {}),
        ...(filters.dataAreaId ? { dataAreaId: filters.dataAreaId } : {}),
        ...(dateRange ? { fromDate: dateRange } : {}),
      },
      include: { vendor: { select: { name: true, code: true } }, item: { select: { productName: true } } },
      orderBy: { fromDate: "desc" },
      take: 500,
    }),
    prisma.agreement.findMany({
      where: {
        ...vendorScope,
        ...(filters.vendorId && isInternal(actor.role) ? { vendorId: filters.vendorId } : {}),
        ...(filters.itemNumber ? { itemNumber: { contains: filters.itemNumber, mode: "insensitive" } } : {}),
        ...(filters.dataAreaId ? { dataAreaId: filters.dataAreaId } : {}),
        // Only decided requests belong in a price history. A pending one is a
        // proposal, not something that was ever paid.
        status: { in: ["APPROVED", "REJECTED"] },
        ...(dateRange ? { fromDate: dateRange } : {}),
      },
      include: { vendor: { select: { name: true, code: true } } },
      orderBy: { fromDate: "desc" },
      take: 500,
    }),
  ]);

  const entries: HistoryEntry[] = [
    ...synced.map((a) => ({
      id: a.id,
      source: "D365" as const,
      itemNumber: a.itemNumber,
      itemName: a.item?.productName ?? null,
      vendorName: a.vendor?.name ?? null,
      vendorCode: a.vendorCode ?? a.vendor?.code ?? null,
      dataAreaId: a.dataAreaId,
      currency: a.currency,
      amount: Number(a.amount),
      fromDate: a.fromDate,
      toDate: a.toDate,
      reference: null,
      status: null,
      recordedAt: a.lastSyncedAt,
      changePercent: null,
    })),
    ...portal.map((a) => ({
      id: a.id,
      source: "PORTAL" as const,
      itemNumber: a.itemNumber,
      itemName: a.itemName,
      vendorName: a.vendor.name,
      vendorCode: a.vendor.code,
      dataAreaId: a.dataAreaId,
      currency: a.currency,
      amount: Number(a.amount),
      fromDate: a.fromDate,
      toDate: a.toDate,
      reference: a.reference,
      status: a.status,
      recordedAt: a.decidedAt ?? a.createdAt,
      changePercent: null,
    })),
  ];

  // Chronological within each item and entity, so a change percentage means
  // something. Rejected requests are left out of the comparison chain, since
  // a price that was never agreed did not change anything.
  const byKey = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const key = `${e.itemNumber}|${e.dataAreaId}|${e.vendorCode ?? ""}`;
    const list = byKey.get(key) ?? [];
    list.push(e);
    byKey.set(key, list);
  }

  for (const list of byKey.values()) {
    const effective = list
      .filter((e) => e.status !== "REJECTED")
      .sort((a, b) => (a.fromDate?.getTime() ?? 0) - (b.fromDate?.getTime() ?? 0));

    for (let i = 1; i < effective.length; i += 1) {
      const previous = effective[i - 1].amount;
      if (previous > 0) {
        effective[i].changePercent = ((effective[i].amount - previous) / previous) * 100;
      }
    }
  }

  return entries.sort((a, b) => {
    const byDate = (b.fromDate?.getTime() ?? 0) - (a.fromDate?.getTime() ?? 0);
    return byDate !== 0 ? byDate : b.recordedAt.getTime() - a.recordedAt.getTime();
  });
}

/** Compact chronology for one item and vendor, used on the agreement page. */
export async function priceHistoryFor(actor: Actor, itemNumber: string, dataAreaId: string) {
  const all = await priceHistory(actor, { itemNumber, dataAreaId });
  return all.filter((e) => e.itemNumber === itemNumber).slice(0, 25);
}
