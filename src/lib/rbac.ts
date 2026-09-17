import type { Role } from "@prisma/client";

export const HB_ROLES: Role[] = ["HB_USER", "HB_APPROVER", "HB_ADMIN"];

export function isInternal(role?: Role | null): boolean {
  return !!role && HB_ROLES.includes(role);
}
export function canApprove(role?: Role | null): boolean {
  return role === "HB_APPROVER" || role === "HB_ADMIN";
}
export function canAdminister(role?: Role | null): boolean {
  return role === "HB_ADMIN";
}
export function canSubmit(role?: Role | null): boolean {
  return role === "VENDOR";
}
export function hbDomains(): string[] {
  return (process.env.HB_DOMAINS ?? "hudabeauty.com")
    .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}
export function hbAdminEmails(): string[] {
  return (process.env.HB_ADMIN_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}
