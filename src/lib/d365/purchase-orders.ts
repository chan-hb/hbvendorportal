import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getD365Config, type D365Config } from "./config";
import { odataPages } from "./client";
import { pick, pickDate, pickNumber, type Row } from "./mappers";
import { legalEntitiesOf } from "./sync-items";

/**
 * Purchase orders for one vendor, read live from D365 when they sign in.
 *
 * Unlike the item master this is small per vendor (two years of orders), so it
 * is pulled whole and swapped in, rather than synced incrementally with
 * checkpoints. Three entities are read:
 *
 *   headers   which orders belong to the vendor, their date and status
 *   lines     SKU, name and ordered quantity
 *   receipts  delivered quantity, and when it was delivered
 *
 * The standard line entity carries no delivered quantity, which is why product
 * receipts are read at all. They also give the real delivery date, which is
 * what the delivered-over-time chart needs.
 *
 * PO numbers are only unique within a company (hbfr and others use a plain
 * PO000nnnn sequence), so every match is on dataAreaId and number together.
 */

export const PO_HISTORY_YEARS = 2;
/** A refresh this recent is reused rather than repeated, e.g. on a page reload. */
const FRESH_FOR_MS = 15 * 60 * 1000;
/** A RUNNING row older than this was abandoned by a restart, not still working. */
const STALE_RUN_MS = 10 * 60 * 1000;
/** PO numbers per OData request. Keeps the URL well under server limits. */
const CHUNK = 20;
const CONCURRENCY = 4;

export type PoStatus = "OPEN" | "RECEIVED" | "INVOICED" | "CANCELLED";

/** In-process de-duplication, so concurrent triggers share one pull. */
const inFlight = new Map<string, Promise<void>>();

function mapHeaderStatus(raw?: string): PoStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "received":
    case "2":
      return "RECEIVED";
    case "invoiced":
    case "3":
      return "INVOICED";
    case "canceled":
    case "cancelled":
    case "4":
      return "CANCELLED";
    default:
      // Backorder ("Open order") and None are both still open.
      return "OPEN";
  }
}

function quote(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function cutoffDate() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - PO_HISTORY_YEARS);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function readAll(cfg: D365Config, entity: string, select: string[], filter: string): Promise<Row[]> {
  const out: Row[] = [];
  for await (const page of odataPages<Row>(cfg, entity, { select, filter, crossCompany: true })) {
    out.push(...page.rows);
  }
  return out;
}

async function inBatches<T, R>(items: T[], size: number, fn: (batch: T[]) => Promise<R[]>): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  const out: R[] = [];
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const results = await Promise.all(batches.slice(i, i + CONCURRENCY).map(fn));
    for (const r of results) out.push(...r);
  }
  return out;
}

/** Filter matching any of a set of orders, grouped by company. */
function orderFilter(dataAreaId: string, numbers: string[]) {
  return `dataAreaId eq ${quote(dataAreaId)} and (${numbers
    .map((n) => `PurchaseOrderNumber eq ${quote(n)}`)
    .join(" or ")})`;
}

async function setStage(vendorId: string, stage: string) {
  await prisma.vendorPoRefresh.update({ where: { vendorId }, data: { stage } }).catch(() => undefined);
}

async function pull(vendorId: string, vendorCode: string) {
  const cfg = await getD365Config();
  const cutoff = cutoffDate();
  const allowed = new Set(legalEntitiesOf(cfg.legalEntities));

  // 1. Headers
  await setStage(vendorId, "headers");
  const headerRows = await readAll(
    cfg,
    cfg.poHeaderEntity,
    ["dataAreaId", "PurchaseOrderNumber", "AccountingDate", "PurchaseOrderStatus"],
    `OrderVendorAccountNumber eq ${quote(vendorCode)} and AccountingDate ge ${cutoff.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
  );

  type Header = { dataAreaId: string; number: string; orderDate: Date; status: PoStatus };
  const headers = new Map<string, Header>();
  for (const row of headerRows) {
    const dataAreaId = pick(row, ["dataAreaId", "DataAreaId"])?.toLowerCase();
    const number = pick(row, ["PurchaseOrderNumber"]);
    const orderDate = pickDate(row, ["AccountingDate", "OrderDate"]);
    if (!dataAreaId || !number || !orderDate) continue;
    if (allowed.size && !allowed.has(dataAreaId)) continue;
    headers.set(`${dataAreaId}|${number}`, {
      dataAreaId,
      number,
      orderDate,
      status: mapHeaderStatus(pick(row, ["PurchaseOrderStatus"])),
    });
  }

  const byCompany = new Map<string, string[]>();
  for (const h of headers.values()) {
    const list = byCompany.get(h.dataAreaId) ?? [];
    list.push(h.number);
    byCompany.set(h.dataAreaId, list);
  }

  // 2. Lines
  await setStage(vendorId, "lines");
  const lineRows: Row[] = [];
  for (const [dataAreaId, numbers] of byCompany) {
    lineRows.push(
      ...(await inBatches(numbers, CHUNK, (batch) =>
        readAll(
          cfg,
          cfg.poLineEntity,
          [
            "dataAreaId",
            "PurchaseOrderNumber",
            "LineNumber",
            "ItemNumber",
            "LineDescription",
            "OrderedPurchaseQuantity",
            "IsDeleted",
          ],
          orderFilter(dataAreaId, batch),
        ),
      )),
    );
  }

  // 3. Receipts
  await setStage(vendorId, "receipts");
  const receiptRows: Row[] = [];
  for (const [dataAreaId, numbers] of byCompany) {
    receiptRows.push(
      ...(await inBatches(numbers, CHUNK, (batch) =>
        readAll(
          cfg,
          cfg.poReceiptEntity,
          [
            "dataAreaId",
            "RecordId",
            "PurchaseOrderNumber",
            "PurchaseOrderLineNumber",
            "ItemNumber",
            "ReceivedPurchaseQuantity",
            "ProductReceiptDate",
          ],
          orderFilter(dataAreaId, batch),
        ),
      )),
    );
  }

  // 4. Shape and store
  await setStage(vendorId, "saving");

  const receipts: Prisma.PurchaseReceiptCreateManyInput[] = [];
  const delivered = new Map<string, number>();
  for (const row of receiptRows) {
    const dataAreaId = pick(row, ["dataAreaId", "DataAreaId"])?.toLowerCase();
    const number = pick(row, ["PurchaseOrderNumber"]);
    const lineNumber = pickNumber(row, ["PurchaseOrderLineNumber", "LineNumber"]);
    const quantity = pickNumber(row, ["ReceivedPurchaseQuantity", "Quantity"]);
    const receiptDate = pickDate(row, ["ProductReceiptDate", "DeliveryDate"]);
    const itemNumber = pick(row, ["ItemNumber", "ProductNumber"]);
    if (!dataAreaId || !number || lineNumber === undefined || quantity === undefined || !receiptDate) continue;
    if (!headers.has(`${dataAreaId}|${number}`)) continue;

    const lineKey = `${dataAreaId}|${number}|${lineNumber}`;
    delivered.set(lineKey, (delivered.get(lineKey) ?? 0) + quantity);

    // Non-stock lines (services, procurement categories) carry no item number.
    // They count towards nothing on this page.
    if (!itemNumber) continue;
    const recId = pick(row, ["RecordId", "RecId"]);
    receipts.push({
      vendorId,
      externalKey: recId
        ? `${dataAreaId}|${recId}`
        : `${lineKey}|${receiptDate.toISOString()}|${quantity}|${receipts.length}`,
      dataAreaId,
      purchaseOrderNumber: number,
      lineNumber: Math.trunc(lineNumber),
      itemNumber,
      receiptDate,
      quantity: new Prisma.Decimal(quantity),
    });
  }

  const lines: Prisma.PurchaseOrderLineCreateManyInput[] = [];
  const seen = new Set<string>();
  for (const row of lineRows) {
    const dataAreaId = pick(row, ["dataAreaId", "DataAreaId"])?.toLowerCase();
    const number = pick(row, ["PurchaseOrderNumber"]);
    const lineNumber = pickNumber(row, ["LineNumber"]);
    const itemNumber = pick(row, ["ItemNumber"]);
    if (!dataAreaId || !number || lineNumber === undefined || !itemNumber) continue;
    if ((pick(row, ["IsDeleted"]) ?? "").toLowerCase() === "yes") continue;

    const header = headers.get(`${dataAreaId}|${number}`);
    if (!header) continue;
    const lineKey = `${dataAreaId}|${number}|${Math.trunc(lineNumber)}`;
    if (seen.has(lineKey)) continue;
    seen.add(lineKey);

    lines.push({
      vendorId,
      dataAreaId,
      purchaseOrderNumber: number,
      lineNumber: Math.trunc(lineNumber),
      orderDate: header.orderDate,
      poStatus: header.status,
      itemNumber,
      itemName: pick(row, ["LineDescription", "ProductName"]) ?? null,
      orderedQty: new Prisma.Decimal(pickNumber(row, ["OrderedPurchaseQuantity"]) ?? 0),
      // A cancelled receipt posts a negative line, so the sum can dip below
      // zero briefly in the data. Nothing negative is shown.
      deliveredQty: new Prisma.Decimal(Math.max(0, delivered.get(lineKey) ?? 0)),
    });
  }

  const orderCount = new Set(lines.map((l) => `${l.dataAreaId}|${l.purchaseOrderNumber}`)).size;

  // Replace outright. Anything that has dropped out of the two year window, or
  // been deleted in D365, goes with it.
  await prisma.$transaction([
    prisma.purchaseReceipt.deleteMany({ where: { vendorId } }),
    prisma.purchaseOrderLine.deleteMany({ where: { vendorId } }),
    prisma.purchaseOrderLine.createMany({ data: lines }),
    prisma.purchaseReceipt.createMany({ data: receipts, skipDuplicates: true }),
  ]);

  return { orderCount, lineCount: lines.length };
}

/**
 * Starts a refresh for the vendor unless one is running or the data is fresh.
 * Returns immediately; the page polls the status. Never throws: a failure is
 * recorded on the refresh row and shown to the vendor.
 */
export async function startPurchaseOrderRefresh(vendorId: string, options: { force?: boolean } = {}) {
  if (inFlight.has(vendorId)) return;

  // Claim the slot before the first await, so two calls arriving together
  // (sign-in and the page loading) cannot both get past the check above.
  let release!: () => void;
  inFlight.set(vendorId, new Promise<void>((resolve) => (release = resolve)));
  const done = () => {
    inFlight.delete(vendorId);
    release();
  };

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { code: true, isProvisional: true },
    });
    if (!vendor) return done();

    const state = await prisma.vendorPoRefresh.findUnique({ where: { vendorId } });
    const now = Date.now();
    // Another replica may be running it. Leave that one to finish.
    if (state?.status === "RUNNING" && state.startedAt && now - state.startedAt.getTime() < STALE_RUN_MS) {
      return done();
    }
    if (!options.force && state?.lastSuccessAt && now - state.lastSuccessAt.getTime() < FRESH_FOR_MS) {
      return done();
    }

    // A provisional supplier does not exist in D365 yet, so has no orders.
    if (vendor.isProvisional) {
      const at = new Date();
      await prisma.vendorPoRefresh.upsert({
        where: { vendorId },
        create: { vendorId, status: "SUCCESS", finishedAt: at, lastSuccessAt: at },
        update: { status: "SUCCESS", stage: null, finishedAt: at, lastSuccessAt: at, error: null },
      });
      return done();
    }

    await prisma.vendorPoRefresh.upsert({
      where: { vendorId },
      create: { vendorId, status: "RUNNING", stage: "connecting", startedAt: new Date() },
      update: { status: "RUNNING", stage: "connecting", startedAt: new Date(), error: null },
    });

    // Deliberately not awaited: the caller returns while the pull carries on,
    // and the page polls the refresh row for progress.
    void (async () => {
      try {
        const { orderCount, lineCount } = await pull(vendorId, vendor.code);
        const at = new Date();
        await prisma.vendorPoRefresh.update({
          where: { vendorId },
          data: { status: "SUCCESS", stage: null, finishedAt: at, lastSuccessAt: at, orderCount, lineCount, error: null },
        });
      } catch (err) {
        console.error("[po-refresh]", vendorId, err);
        await prisma.vendorPoRefresh
          .update({
            where: { vendorId },
            data: { status: "FAILED", stage: null, finishedAt: new Date(), error: (err as Error).message.slice(0, 500) },
          })
          .catch(() => undefined);
      } finally {
        done();
      }
    })();
  } catch (err) {
    console.error("[po-refresh] could not start", vendorId, err);
    done();
  }
}

export async function getPurchaseOrderRefreshState(vendorId: string) {
  return prisma.vendorPoRefresh.findUnique({ where: { vendorId } });
}
