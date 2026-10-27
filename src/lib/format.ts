import type { AgreementStatus } from "@prisma/client";

export function money(amount: unknown, currency: string) {
  const n = Number(amount);
  try {
    return new Intl.NumberFormat("en-AE", { style: "currency", currency, maximumFractionDigits: 4 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function shortDate(d?: Date | string | null) {
  if (!d) return "Open ended";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(d?: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export const STATUS_LABEL: Record<AgreementStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting approval",
  CHANGE_REQUESTED: "Change requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/**
 * Status uses the shared state classes, so the brand palette is defined once
 * in globals.css rather than scattered through components.
 */
export const STATUS_CLASS: Record<AgreementStatus, string> = {
  DRAFT: "state-quiet",
  SUBMITTED: "state-pending",
  CHANGE_REQUESTED: "state-waiting",
  APPROVED: "state-done",
  REJECTED: "state-stopped",
};
