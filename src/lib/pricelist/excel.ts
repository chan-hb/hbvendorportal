import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/agreements";

/**
 * Price list as a spreadsheet, out and back in.
 *
 * Suppliers maintain prices in Excel whatever a portal offers, so the round
 * trip is the workflow rather than a convenience. The export carries the item
 * number and legal entity as the key, plus the price currently in force, so a
 * supplier edits against what is actually live rather than from memory.
 *
 * Nothing in the returned file is trusted. Every row is re-checked against the
 * signed-in vendor's own items before anything is created, because the file has
 * been out of our hands and rows can be added to it.
 */

const SHEET = "Price list";
const HEADERS = [
  "Item number",
  "Description",
  "Legal entity",
  "Currency",
  "Current price",
  "New price",
  "Valid from (YYYY-MM-DD)",
  "Valid to (YYYY-MM-DD)",
  "Notes",
] as const;

export type ImportRow = {
  rowNumber: number;
  itemNumber: string;
  dataAreaId: string;
  currency: string;
  amount: number;
  fromDate: Date;
  toDate: Date | null;
  notes?: string;
};

export type ImportProblem = { rowNumber: number; itemNumber: string; reason: string };

export async function buildPriceListWorkbook(vendorId: string): Promise<Buffer> {
  const [vendor, items, legalEntities] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } }),
    prisma.item.findMany({
      where: { primaryVendorId: vendorId, isActive: true },
      orderBy: { itemNumber: "asc" },
      select: { itemNumber: true, productName: true, dataAreaId: true, unit: true },
    }),
    prisma.legalEntity.findMany({ where: { isActive: true }, select: { code: true, currency: true } }),
  ]);

  const agreements = await prisma.tradeAgreement.findMany({
    where: { vendorId, itemNumber: { in: items.map((i) => i.itemNumber) } },
    orderBy: { fromDate: "desc" },
  });

  // Most recent agreement per item and entity, for the reference column.
  const current = new Map<string, { amount: number; currency: string }>();
  for (const a of agreements) {
    const key = `${a.dataAreaId}|${a.itemNumber}`;
    if (!current.has(key)) current.set(key, { amount: Number(a.amount), currency: a.currency });
  }

  const defaultCurrency = new Map(legalEntities.map((le) => [le.code, le.currency ?? "USD"]));

  const rows = items.map((i) => {
    const existing = current.get(`${i.dataAreaId}|${i.itemNumber}`);
    return {
      "Item number": i.itemNumber,
      Description: i.productName ?? "",
      "Legal entity": i.dataAreaId.toUpperCase(),
      Currency: existing?.currency ?? defaultCurrency.get(i.dataAreaId) ?? "USD",
      "Current price": existing?.amount ?? "",
      "New price": "",
      "Valid from (YYYY-MM-DD)": "",
      "Valid to (YYYY-MM-DD)": "",
      Notes: "",
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...HEADERS] });
  sheet["!cols"] = [
    { wch: 16 }, { wch: 38 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 30 },
  ];

  const guidance = XLSX.utils.aoa_to_sheet([
    ["How to use this file"],
    [],
    ["1.", "Fill in New price only for items whose price is changing. Leave the rest blank."],
    ["2.", "Valid from is required on any row with a new price. Valid to may be left blank for open ended."],
    ["3.", "Do not change the Item number or Legal entity columns. They identify the row."],
    ["4.", "Do not add rows. Only items you are the supplier for can be priced."],
    ["5.", "Save as .xlsx and upload it back to the portal."],
    [],
    ["Each priced row becomes a separate request for approval, exactly as if entered by hand."],
    [`Generated ${new Date().toISOString().slice(0, 10)} for ${vendor.name} (${vendor.code}).`],
  ]);
  guidance["!cols"] = [{ wch: 5 }, { wch: 96 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, SHEET);
  XLSX.utils.book_append_sheet(book, guidance, "Instructions");

  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
}

/** Parses an uploaded workbook into rows, without touching the database. */
export function parsePriceListWorkbook(buffer: Buffer): { rows: ImportRow[]; problems: ImportProblem[] } {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = book.SheetNames.includes(SHEET) ? SHEET : book.SheetNames[0];
  if (!sheetName) {
    return { rows: [], problems: [{ rowNumber: 0, itemNumber: "", reason: "The file has no sheets" }] };
  }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[sheetName], { defval: "" });

  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];

  raw.forEach((r, index) => {
    const rowNumber = index + 2; // the header occupies row 1
    const itemNumber = String(r["Item number"] ?? "").trim();
    const priceRaw = String(r["New price"] ?? "").trim();

    // A blank new price means no change. That is the normal case for most rows
    // and must not be reported as an error.
    if (!priceRaw) return;

    if (!itemNumber) {
      problems.push({ rowNumber, itemNumber: "", reason: "New price given but no item number" });
      return;
    }

    const amount = Number(priceRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      problems.push({ rowNumber, itemNumber, reason: `"${priceRaw}" is not a price above zero` });
      return;
    }

    const currency = String(r["Currency"] ?? "").trim().toUpperCase();
    if (currency.length !== 3) {
      problems.push({ rowNumber, itemNumber, reason: "Currency must be a three letter code" });
      return;
    }

    const fromDate = toDate(r["Valid from (YYYY-MM-DD)"]);
    if (!fromDate) {
      problems.push({ rowNumber, itemNumber, reason: "Valid from is missing or not a date" });
      return;
    }

    const toDateValue = toDate(r["Valid to (YYYY-MM-DD)"]);
    if (toDateValue && toDateValue < fromDate) {
      problems.push({ rowNumber, itemNumber, reason: "Valid to is before valid from" });
      return;
    }

    rows.push({
      rowNumber,
      itemNumber,
      dataAreaId: String(r["Legal entity"] ?? "").trim().toLowerCase(),
      currency,
      amount,
      fromDate,
      toDate: toDateValue,
      notes: String(r["Notes"] ?? "").trim() || undefined,
    });
  });

  return { rows, problems };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Raises one agreement per priced row. Rejected rows are reported rather than
 * silently dropped: a supplier needs to know what did not go through.
 */
export async function importPriceList(actor: Actor, rows: ImportRow[]) {
  if (actor.role !== "VENDOR" || !actor.vendorId) throw new Error("Only vendor users can upload a price list");

  const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: actor.vendorId } });
  const { createAgreement } = await import("@/lib/agreements");

  const created: string[] = [];
  const rejected: ImportProblem[] = [];

  for (const row of rows) {
    try {
      const item = await prisma.item.findUnique({ where: { itemNumber: row.itemNumber } });
      if (!item) throw new Error("Not in the item master");
      if (item.primaryVendorCode !== vendor.code) throw new Error("You are not the supplier for this item");

      const agreement = await createAgreement(
        actor,
        {
          dataAreaId: row.dataAreaId || item.dataAreaId,
          itemNumber: row.itemNumber,
          currency: row.currency,
          amount: row.amount,
          unit: item.unit ?? undefined,
          fromDate: row.fromDate,
          toDate: row.toDate,
          notes: row.notes ? `Uploaded from price list. ${row.notes}` : "Uploaded from price list",
        },
        true,
      );
      created.push(agreement.reference);
    } catch (err) {
      rejected.push({ rowNumber: row.rowNumber, itemNumber: row.itemNumber, reason: (err as Error).message });
    }
  }

  return { created, rejected };
}
