import type { QuestionBidField, RfqQuestion, RfqVendorType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The launch data sheet.
 *
 * Questions live in the database rather than in code, so Purchasing can add,
 * reword and retire them without a deployment. The defaults below are the
 * template workbook, seeded once on first use.
 *
 * Answers are stored against a question's `key`, not its id or its label. That
 * is what lets a question be reworded, reordered or retired without orphaning
 * what suppliers have already answered.
 *
 * Four questions in each section are already captured on the quotation:
 * supplier name, incoterms, MOQ, and weekly capacity or lead time. Those are
 * QUOTATION questions, shown filled and read-only. Asking twice would produce
 * two answers that disagree, and the quotation's versions are the scored ones.
 */

export const VENDOR_TYPE_LABEL: Record<RfqVendorType, string> = {
  CM: "Contract manufacturer (formula and fill)",
  PRIMARY_PACK: "Primary packaging",
  SECONDARY_PACK: "Secondary packaging",
  LABELS: "Labels",
};

/** The template's own section headings, so the two can be compared. */
export const VENDOR_TYPE_SECTION: Record<RfqVendorType, string> = {
  CM: "FORMULA + F&A",
  PRIMARY_PACK: "PRIMARY PACKAGING",
  SECONDARY_PACK: "SECONDARY PACKAGING",
  LABELS: "LABELS",
};

export const BID_FIELD_LABEL: Record<QuestionBidField, string> = {
  VENDOR_NAME: "Supplier name",
  INCOTERM: "Incoterm",
  MOQ: "Minimum order quantity",
  WEEKLY_CAPACITY: "Weekly capacity",
  LEAD_TIME_DAYS: "Production lead time",
  SAMPLING_LEAD_TIME_DAYS: "Sampling lead time",
  PAYMENT_TERMS_DAYS: "Payment terms",
};

export type Question = RfqQuestion;

// ---------------------------------------------------------------- defaults

type Seed = {
  key: string;
  label: string;
  type: RfqQuestion["type"];
  source: RfqQuestion["source"];
  bidField?: QuestionBidField;
  options?: string[];
  unit?: string;
  required?: boolean;
  vendorTypes: RfqVendorType[];
  sortOrder: number;
};

const ALL: RfqVendorType[] = ["CM", "PRIMARY_PACK", "SECONDARY_PACK", "LABELS"];

/** The template workbook, as it stands today. Seeded once, then owned by the UI. */
export const DEFAULT_QUESTIONS: Seed[] = [
  // Shared across every section, filled from the quotation.
  { key: "supplierName", label: "Supplier name", type: "TEXT", source: "QUOTATION", bidField: "VENDOR_NAME", vendorTypes: ALL, sortOrder: 10 },
  { key: "incoterms", label: "Incoterms", type: "TEXT", source: "QUOTATION", bidField: "INCOTERM", vendorTypes: ALL, sortOrder: 20 },
  { key: "moq", label: "MOQ", type: "NUMBER", source: "QUOTATION", bidField: "MOQ", vendorTypes: ALL, sortOrder: 30 },

  { key: "weeklyFillingCapacity", label: "Weekly filling capacity", type: "NUMBER", source: "QUOTATION", bidField: "WEEKLY_CAPACITY", vendorTypes: ["CM"], sortOrder: 40 },
  { key: "weeklyCapacity", label: "Weekly capacity", type: "NUMBER", source: "QUOTATION", bidField: "WEEKLY_CAPACITY", vendorTypes: ["PRIMARY_PACK"], sortOrder: 40 },
  { key: "standardLeadTime", label: "Standard lead time", type: "NUMBER", source: "QUOTATION", bidField: "LEAD_TIME_DAYS", vendorTypes: ["SECONDARY_PACK", "LABELS"], sortOrder: 40 },

  // Asked of the supplier.
  { key: "shifts", label: "Number of shifts", type: "NUMBER", source: "ANSWER", required: true, vendorTypes: ["CM", "PRIMARY_PACK"], sortOrder: 50 },
  {
    key: "lineType",
    label: "Line automated, semi automated or manual",
    type: "CHOICE",
    source: "ANSWER",
    options: ["Automated", "Semi automated", "Manual"],
    required: true,
    vendorTypes: ["CM"],
    sortOrder: 60,
  },
  { key: "rawMaterialLeadTime", label: "Raw material lead time", type: "NUMBER", source: "ANSWER", unit: "days", required: true, vendorTypes: ["CM", "PRIMARY_PACK"], sortOrder: 70 },
  { key: "leadTimeWithRawMaterial", label: "Standard lead time with raw material in-house", type: "NUMBER", source: "ANSWER", unit: "days", required: true, vendorTypes: ["CM", "PRIMARY_PACK"], sortOrder: 80 },
  { key: "leadTimeWithoutRawMaterial", label: "Standard lead time without raw material in-house", type: "NUMBER", source: "ANSWER", unit: "days", required: true, vendorTypes: ["CM", "PRIMARY_PACK"], sortOrder: 90 },
  { key: "componentsInHouse", label: "Components needed in-house", type: "LONGTEXT", source: "ANSWER", required: true, vendorTypes: ["CM"], sortOrder: 100 },
  { key: "componentsStorageCapacity", label: "Components storage capacity", type: "TEXT", source: "ANSWER", required: true, vendorTypes: ["CM"], sortOrder: 110 },
  { key: "loiPlaced", label: "LOI placed for raw material", type: "YESNO", source: "ANSWER", required: true, vendorTypes: ["CM", "PRIMARY_PACK"], sortOrder: 120 },
  { key: "comments", label: "Additional comments", type: "LONGTEXT", source: "ANSWER", required: false, vendorTypes: ALL, sortOrder: 900 },
];

/**
 * Seeds the defaults the first time the table is read. Does nothing once any
 * question exists, so an administrator who deletes one does not get it back on
 * the next page load.
 */
export async function ensureQuestionsSeeded(): Promise<void> {
  const existing = await prisma.rfqQuestion.count();
  if (existing > 0) return;

  await prisma.rfqQuestion.createMany({
    data: DEFAULT_QUESTIONS.map((q) => ({
      key: q.key,
      label: q.label,
      type: q.type,
      source: q.source,
      bidField: q.bidField ?? null,
      options: q.options ?? [],
      unit: q.unit ?? null,
      required: q.required ?? true,
      vendorTypes: q.vendorTypes,
      sortOrder: q.sortOrder,
      updatedBy: "seed",
    })),
    skipDuplicates: true,
  });
}

// ---------------------------------------------------------------- reading

export async function allQuestions(): Promise<Question[]> {
  await ensureQuestionsSeeded();
  return prisma.rfqQuestion.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
}

/** Active questions for one vendor type, in display order. */
export async function questionsFor(vendorType: RfqVendorType): Promise<Question[]> {
  await ensureQuestionsSeeded();
  return prisma.rfqQuestion.findMany({
    where: { isActive: true, vendorTypes: { has: vendorType } },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

// ---------------------------------------------------------------- answers

export type AnswerMap = Record<string, string>;

export function toAnswerMap(rows: { questionKey: string; value: string }[]): AnswerMap {
  return Object.fromEntries(rows.map((r) => [r.questionKey, r.value]));
}

export type Completeness = {
  complete: boolean;
  missing: { key: string; label: string }[];
  answered: number;
  total: number;
};

/**
 * Whether a supplier has finished the sheet. Takes the questions as an
 * argument rather than loading them, so a caller that already has them does
 * not query twice.
 */
export function checkCompleteness(questions: Question[], answers: AnswerMap): Completeness {
  const required = questions.filter((q) => q.source === "ANSWER" && q.required);
  const missing = required
    .filter((q) => {
      const value = answers[q.key];
      return value === undefined || String(value).trim() === "";
    })
    .map((q) => ({ key: q.key, label: q.label }));

  return {
    complete: missing.length === 0,
    missing,
    answered: required.length - missing.length,
    total: required.length,
  };
}

/** Loads the questions and checks in one go, for callers that have neither. */
export async function checkCompletenessFor(
  vendorType: RfqVendorType,
  answers: AnswerMap,
): Promise<Completeness> {
  return checkCompleteness(await questionsFor(vendorType), answers);
}

// ---------------------------------------------------------------- brackets

/**
 * Quantity breaks read as ranges, so a supplier can see which volumes a price
 * covers. The stored value is the lower bound; the upper bound is the next
 * break, and the last one is open ended.
 */
export function bracketLabel(tiers: number[], index: number): string {
  const sorted = [...tiers].sort((a, b) => a - b);
  const from = sorted[index];
  const to = sorted[index + 1];
  if (from === undefined) return "";
  return to === undefined
    ? `${from.toLocaleString()} and above`
    : `${from.toLocaleString()} to ${(to - 1).toLocaleString()}`;
}

export function bracketLabels(tiers: number[]): { quantity: number; label: string }[] {
  const sorted = [...tiers].sort((a, b) => a - b);
  return sorted.map((quantity, index) => ({ quantity, label: bracketLabel(sorted, index) }));
}
