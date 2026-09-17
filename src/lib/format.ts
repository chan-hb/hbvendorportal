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

export const STATUS_CLASS: Record<AgreementStatus, string> = {
  DRAFT: "bg-cloud text-charcoal border-line",
  SUBMITTED: "bg-pink-50 text-pink-600 border-pink/30",
  CHANGE_REQUESTED: "bg-[#FBF0E8] text-nude border-nude/40",
  APPROVED: "bg-[#EAF4EE] text-[#2C6B44] border-[#2C6B44]/25",
  REJECTED: "bg-[#FBEAEA] text-[#A32B2B] border-[#A32B2B]/25",
};
