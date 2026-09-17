/**
 * D365 F&O OData field names differ between entity versions and between
 * environments that carry extensions. Rather than hard-coding one shape, each
 * mapper reads the first candidate key that is present on the row.
 *
 * If your environment uses different names, add them to the candidate arrays
 * here. Nothing else in the app needs to change.
 */
export type Row = Record<string, unknown>;

export function pick(row: Row, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

export function pickNumber(row: Row, candidates: string[]): number | undefined {
  const raw = pick(row, candidates);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function pickDate(row: Row, candidates: string[]): Date | undefined {
  const raw = pick(row, candidates);
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  // D365 uses 1900-01-01 and 2154-12-31 as "no date" sentinels.
  const year = d.getUTCFullYear();
  if (year <= 1901 || year >= 2150) return undefined;
  return d;
}

export type MappedVendor = {
  dataAreaId: string;
  code: string;
  name: string;
  vendorGroupId?: string;
  currency?: string;
  isBlocked: boolean;
};

export function mapVendor(row: Row): MappedVendor | null {
  const code = pick(row, ["VendorAccountNumber", "VendorAccount", "AccountNum"]);
  const dataAreaId = pick(row, ["dataAreaId", "DataAreaId"]);
  if (!code || !dataAreaId) return null;

  // Blocked can arrive as an enum string ("Yes"/"No"/"All"/"Never") or a boolean.
  const blockedRaw = pick(row, [
    "IsBlockedForPurchase",
    "PurchasingBlockedReason",
    "VendorPartyType_Blocked",
    "Blocked",
  ]);
  const isBlocked =
    blockedRaw !== undefined &&
    !["no", "never", "false", "none", "0"].includes(blockedRaw.toLowerCase());

  return {
    dataAreaId: dataAreaId.toLowerCase(),
    code,
    name:
      pick(row, ["VendorOrganizationName", "VendorName", "Name", "OrganizationName", "VendorSearchName"]) ??
      code,
    vendorGroupId: pick(row, ["VendorGroupId", "VendGroup"]),
    currency: pick(row, ["VendorCurrencyCode", "CurrencyCode", "Currency"]),
    isBlocked,
  };
}

export type MappedItem = {
  dataAreaId: string;
  itemNumber: string;
  productName?: string;
  searchName?: string;
  unit?: string;
  itemGroupId?: string;
  primaryVendorCode?: string;
};

export function mapItem(row: Row): MappedItem | null {
  const itemNumber = pick(row, ["ItemNumber", "ProductNumber", "ItemId"]);
  const dataAreaId = pick(row, ["dataAreaId", "DataAreaId"]);
  if (!itemNumber || !dataAreaId) return null;
  return {
    dataAreaId: dataAreaId.toLowerCase(),
    itemNumber,
    productName: pick(row, ["ProductName", "Name", "ProductSearchName"]),
    searchName: pick(row, ["SearchName", "ProductSearchName"]),
    unit: pick(row, ["PurchaseUnitSymbol", "InventoryUnitSymbol", "UnitSymbol", "Unit"]),
    itemGroupId: pick(row, ["ItemGroupId", "ItemModelGroupId"]),
    // The default vendor on the item master. This is the field that
    // establishes which single vendor actively supplies the item.
    primaryVendorCode: pick(row, [
      "PrimaryVendorAccountNumber",
      "PrimaryVendorAccount",
      "DefaultVendorAccountNumber",
      "PurchaseVendorAccountNumber",
      "VendorAccountNumber",
    ]),
  };
}

export type MappedTradeAgreement = {
  dataAreaId: string;
  itemNumber: string;
  vendorCode?: string;
  accountRelation?: string;
  currency: string;
  amount: number;
  unit?: string;
  quantityFrom?: number;
  fromDate?: Date;
  toDate?: Date;
  externalKey: string;
};

export function mapTradeAgreement(row: Row): MappedTradeAgreement | null {
  const itemNumber = pick(row, ["ItemNumber", "ItemCode", "ProductNumber", "ItemRelation"]);
  const dataAreaId = (pick(row, ["dataAreaId", "DataAreaId"]) ?? "").toLowerCase();
  const currency = pick(row, ["CurrencyCode", "Currency", "PriceCurrencyCode"]);
  const amount = pickNumber(row, ["Amount", "Price", "UnitPrice", "AmountInCurrency"]);

  if (!itemNumber || !dataAreaId || !currency || amount === undefined) return null;

  const accountRelation = pick(row, ["AccountCode", "AccountRelation", "VendorAccountNumber", "AccountNumber"]);
  const fromDate = pickDate(row, ["FromDate", "ValidFromDate", "EffectiveDate"]);
  const toDate = pickDate(row, ["ToDate", "ValidToDate", "ExpirationDate"]);

  const recId = pick(row, ["RecId", "@odata.etag", "JournalNumber"]) ?? "";
  const externalKey =
    recId !== ""
      ? `${dataAreaId}|${recId}`
      : [dataAreaId, itemNumber, accountRelation ?? "", currency, fromDate?.toISOString() ?? ""].join("|");

  return {
    dataAreaId,
    itemNumber,
    vendorCode: accountRelation,
    accountRelation,
    currency,
    amount,
    unit: pick(row, ["UnitSymbol", "Unit", "PriceUnit"]),
    quantityFrom: pickNumber(row, ["QuantityAmountFrom", "FromQuantity", "QuantityFrom"]),
    fromDate,
    toDate,
    externalKey,
  };
}
