import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { MappedItem, MappedTradeAgreement } from "./mappers";

/**
 * One INSERT ... ON CONFLICT per page rather than one round trip per row.
 *
 * At 327k items the per-row approach needs 327k round trips, which is the
 * difference between a sync that finishes in minutes and one that never
 * finishes. The page is sent as a single jsonb parameter and expanded server
 * side with jsonb_to_recordset, which keeps the parameter count at one
 * regardless of batch size and avoids any ambiguity about how arrays are
 * serialised by the client.
 *
 * Everything crosses the wire as text and is cast explicitly in SQL, so no
 * numeric precision is lost to JavaScript doubles on the way.
 */

const MAX_ROWS_PER_STATEMENT = 2000;

function chunk<T>(rows: T[], size = MAX_ROWS_PER_STATEMENT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

const iso = (d?: Date | null) => (d ? d.toISOString() : null);
const num = (n?: number | null) => (n === undefined || n === null ? null : String(n));

export type ItemUpsertRow = MappedItem & {
  legalEntityId: string | null;
};

export async function bulkUpsertItems(rows: ItemUpsertRow[]): Promise<number> {
  let written = 0;

  for (const batch of chunk(rows)) {
    const payload = JSON.stringify(
      batch.map((r) => ({
        id: randomUUID(),
        dataAreaId: r.dataAreaId,
        itemNumber: r.itemNumber,
        productName: r.productName ?? null,
        searchName: r.searchName ?? null,
        unit: r.unit ?? null,
        itemGroupId: r.itemGroupId ?? null,
        primaryVendorCode: r.primaryVendorCode ?? null,
        legalEntityId: r.legalEntityId,
      })),
    );

    await prisma.$executeRaw`
      INSERT INTO "Item" (
        id, "dataAreaId", "itemNumber", "productName", "searchName", unit,
        "itemGroupId", "primaryVendorCode", "primaryVendorId", "legalEntityId",
        "isActive", "lastSyncedAt"
      )
      SELECT
        d.id, d."dataAreaId", d."itemNumber", d."productName", d."searchName", d.unit,
        d."itemGroupId", d."primaryVendorCode", v.id, d."legalEntityId",
        true, now()
      FROM jsonb_to_recordset(${payload}::jsonb) AS d(
        id                  text,
        "dataAreaId"        text,
        "itemNumber"        text,
        "productName"       text,
        "searchName"        text,
        unit                text,
        "itemGroupId"       text,
        "primaryVendorCode" text,
        "legalEntityId"     text
      )
      -- Resolve the default vendor in SQL rather than holding the whole
      -- vendor master in memory on the application side.
      LEFT JOIN "Vendor" v ON v.code = d."primaryVendorCode"
      ON CONFLICT ("dataAreaId", "itemNumber") DO UPDATE SET
        "productName"       = EXCLUDED."productName",
        "searchName"        = EXCLUDED."searchName",
        unit                = EXCLUDED.unit,
        "itemGroupId"       = EXCLUDED."itemGroupId",
        "primaryVendorCode" = EXCLUDED."primaryVendorCode",
        -- Never blank an existing link just because this page ran before the
        -- vendor master did.
        "primaryVendorId"   = COALESCE(EXCLUDED."primaryVendorId", "Item"."primaryVendorId"),
        "legalEntityId"     = COALESCE(EXCLUDED."legalEntityId", "Item"."legalEntityId"),
        "isActive"          = true,
        "lastSyncedAt"      = now()
    `;
    written += batch.length;
  }

  return written;
}

export type TradeAgreementUpsertRow = MappedTradeAgreement;

export async function bulkUpsertTradeAgreements(rows: TradeAgreementUpsertRow[]): Promise<number> {
  let written = 0;

  for (const batch of chunk(rows)) {
    const payload = JSON.stringify(
      batch.map((r) => ({
        id: randomUUID(),
        dataAreaId: r.dataAreaId,
        itemNumber: r.itemNumber,
        vendorCode: r.vendorCode ?? null,
        accountRelation: r.accountRelation ?? null,
        currency: r.currency,
        amount: num(r.amount),
        unit: r.unit ?? null,
        quantityFrom: num(r.quantityFrom),
        fromDate: iso(r.fromDate),
        toDate: iso(r.toDate),
        externalKey: r.externalKey,
      })),
    );

    await prisma.$executeRaw`
      INSERT INTO "TradeAgreement" (
        id, "dataAreaId", "itemNumber", "vendorCode", "accountRelation", currency,
        amount, unit, "quantityFrom", "fromDate", "toDate", "externalKey",
        "itemId", "vendorId", "lastSyncedAt"
      )
      SELECT
        d.id, d."dataAreaId", d."itemNumber", d."vendorCode", d."accountRelation", d.currency,
        d.amount::numeric, d.unit, NULLIF(d."quantityFrom", '')::numeric,
        NULLIF(d."fromDate", '')::timestamptz, NULLIF(d."toDate", '')::timestamptz,
        d."externalKey", i.id,
        -- Prefer the account on the agreement itself. When it sits against a
        -- group or all vendors, fall back to the item's default vendor.
        COALESCE(v.id, i."primaryVendorId"),
        now()
      FROM jsonb_to_recordset(${payload}::jsonb) AS d(
        id                text,
        "dataAreaId"      text,
        "itemNumber"      text,
        "vendorCode"      text,
        "accountRelation" text,
        currency          text,
        amount            text,
        unit              text,
        "quantityFrom"    text,
        "fromDate"        text,
        "toDate"          text,
        "externalKey"     text
      )
      LEFT JOIN "Item" i ON i."dataAreaId" = d."dataAreaId" AND i."itemNumber" = d."itemNumber"
      LEFT JOIN "Vendor" v ON v.code = d."vendorCode"
      ON CONFLICT ("externalKey") DO UPDATE SET
        "dataAreaId"      = EXCLUDED."dataAreaId",
        "itemNumber"      = EXCLUDED."itemNumber",
        "vendorCode"      = EXCLUDED."vendorCode",
        "accountRelation" = EXCLUDED."accountRelation",
        currency          = EXCLUDED.currency,
        amount            = EXCLUDED.amount,
        unit              = EXCLUDED.unit,
        "quantityFrom"    = EXCLUDED."quantityFrom",
        "fromDate"        = EXCLUDED."fromDate",
        "toDate"          = EXCLUDED."toDate",
        "itemId"          = COALESCE(EXCLUDED."itemId", "TradeAgreement"."itemId"),
        "vendorId"        = COALESCE(EXCLUDED."vendorId", "TradeAgreement"."vendorId"),
        "lastSyncedAt"    = now()
    `;
    written += batch.length;
  }

  return written;
}
