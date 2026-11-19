import { prisma } from "@/lib/prisma";

/**
 * Everything the vendor purchase orders page shows, built from the rows the
 * last refresh stored. Always scoped to one vendor: the caller passes the
 * vendor from the session, never from the request.
 */

export type PoLineView = {
  itemNumber: string;
  itemName: string | null;
  orderedQty: number;
  deliveredQty: number;
};

export type PoView = {
  key: string;
  dataAreaId: string;
  purchaseOrderNumber: string;
  orderDate: string;
  status: string;
  orderedQty: number;
  deliveredQty: number;
  lines: PoLineView[];
};

export type MonthPoint = { month: string; ordered: number; delivered: number };
export type SkuPoint = { itemNumber: string; itemName: string | null; ordered: number; delivered: number };

export type PurchaseOrderData = {
  openOrders: PoView[];
  /** Received or invoiced. Open and cancelled orders are left out. */
  completedOrders: PoView[];
  monthly: MonthPoint[];
  topSkus: SkuPoint[];
  kpis: {
    openOrders: number;
    outstandingQty: number;
    deliveredLast12: number;
    fillRate: number | null;
  };
  hasData: boolean;
};

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The last 24 calendar months, oldest first, so empty months still show. */
function monthWindow(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    out.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

export async function vendorPurchaseOrders(vendorId: string): Promise<PurchaseOrderData> {
  const [lines, receipts] = await Promise.all([
    prisma.purchaseOrderLine.findMany({
      where: { vendorId },
      orderBy: [{ orderDate: "desc" }, { purchaseOrderNumber: "desc" }, { lineNumber: "asc" }],
    }),
    prisma.purchaseReceipt.findMany({
      where: { vendorId },
      select: { receiptDate: true, quantity: true },
    }),
  ]);

  // Group lines into orders, keeping the newest-first order from the query.
  const orders = new Map<string, PoView>();
  for (const l of lines) {
    const key = `${l.dataAreaId}|${l.purchaseOrderNumber}`;
    let po = orders.get(key);
    if (!po) {
      po = {
        key,
        dataAreaId: l.dataAreaId,
        purchaseOrderNumber: l.purchaseOrderNumber,
        orderDate: l.orderDate.toISOString(),
        status: l.poStatus,
        orderedQty: 0,
        deliveredQty: 0,
        lines: [],
      };
      orders.set(key, po);
    }
    const ordered = Number(l.orderedQty);
    const delivered = Number(l.deliveredQty);
    po.orderedQty += ordered;
    po.deliveredQty += delivered;
    po.lines.push({ itemNumber: l.itemNumber, itemName: l.itemName, orderedQty: ordered, deliveredQty: delivered });
  }

  const all = [...orders.values()];
  const openOrders = all.filter((o) => o.status === "OPEN");
  const completedOrders = all.filter((o) => o.status === "RECEIVED" || o.status === "INVOICED");

  // Monthly: ordered by order month, delivered by receipt month. Cancelled
  // orders never turn into deliveries, so they are left out of "ordered" too.
  const months = monthWindow();
  const series = new Map(months.map((m) => [m, { month: m, ordered: 0, delivered: 0 }]));
  for (const l of lines) {
    if (l.poStatus === "CANCELLED") continue;
    const point = series.get(monthKey(l.orderDate));
    if (point) point.ordered += Number(l.orderedQty);
  }
  for (const r of receipts) {
    const point = series.get(monthKey(r.receiptDate));
    if (point) point.delivered += Number(r.quantity);
  }

  const skus = new Map<string, SkuPoint>();
  for (const l of lines) {
    if (l.poStatus === "CANCELLED") continue;
    const s = skus.get(l.itemNumber) ?? { itemNumber: l.itemNumber, itemName: l.itemName, ordered: 0, delivered: 0 };
    s.ordered += Number(l.orderedQty);
    s.delivered += Number(l.deliveredQty);
    if (!s.itemName && l.itemName) s.itemName = l.itemName;
    skus.set(l.itemNumber, s);
  }
  const topSkus = [...skus.values()].sort((a, b) => b.delivered - a.delivered || b.ordered - a.ordered).slice(0, 8);

  const last12 = new Set(months.slice(-12));
  const deliveredLast12 = [...series.values()].filter((p) => last12.has(p.month)).reduce((t, p) => t + p.delivered, 0);

  const outstandingQty = openOrders.reduce(
    (t, o) => t + o.lines.reduce((s, l) => s + Math.max(0, l.orderedQty - l.deliveredQty), 0),
    0,
  );

  // Fill rate on completed orders only. Open orders are mostly not due yet,
  // and counting them would read as under-delivery that has not happened.
  const completed = all.filter((o) => o.status === "RECEIVED" || o.status === "INVOICED");
  const totalOrdered = completed.reduce((t, o) => t + o.orderedQty, 0);
  const totalDelivered = completed.reduce((t, o) => t + o.deliveredQty, 0);

  return {
    openOrders,
    completedOrders,
    monthly: [...series.values()],
    topSkus,
    kpis: {
      openOrders: openOrders.length,
      outstandingQty,
      deliveredLast12,
      fillRate: totalOrdered > 0 ? Math.min(1, totalDelivered / totalOrdered) : null,
    },
    hasData: lines.length > 0,
  };
}
