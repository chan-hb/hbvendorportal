import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { domainOf, hbAdminEmails, hbDomains } from "@/lib/rbac";

export type AccessDecision =
  | { allowed: true; role: Role; vendorId: string | null; reason: string }
  | { allowed: false; reason: string };

/**
 * Single source of truth for "who is allowed in, and as what".
 *
 * Order of evaluation:
 *   1. Huda Beauty mail domain  -> internal staff (admin if listed in HB_ADMIN_EMAILS)
 *   2. Explicit AllowedEmail    -> vendor user, mapped to that vendor
 *   3. Active vendor domain     -> vendor user, mapped to that vendor
 *   4. Otherwise                -> denied
 */
export async function resolveAccess(rawEmail: string): Promise<AccessDecision> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) return { allowed: false, reason: "Invalid email address" };

  const domain = domainOf(email);

  // 1. Internal staff
  if (hbDomains().includes(domain)) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { role: true, isActive: true } });
    if (existing && !existing.isActive) return { allowed: false, reason: "This account has been deactivated" };

    // Never downgrade a role that an admin has already set in the UI.
    if (existing && existing.role !== "VENDOR") {
      return { allowed: true, role: existing.role, vendorId: null, reason: "Huda Beauty staff" };
    }
    const role: Role = hbAdminEmails().includes(email) ? "HB_ADMIN" : "HB_USER";
    return { allowed: true, role, vendorId: null, reason: "Huda Beauty staff" };
  }

  // 2. Explicit allow-list
  const allowed = await prisma.allowedEmail.findUnique({
    where: { email },
    include: { vendor: { select: { id: true, isActive: true } } },
  });
  if (allowed) {
    if (!allowed.vendor.isActive) return { allowed: false, reason: "Vendor account is inactive" };
    return { allowed: true, role: "VENDOR", vendorId: allowed.vendorId, reason: "Allow-listed vendor contact" };
  }

  // 3. Vendor domain match
  const vendor = await prisma.vendor.findFirst({
    where: { isActive: true, domains: { has: domain } },
    select: { id: true },
  });
  if (vendor) {
    return { allowed: true, role: "VENDOR", vendorId: vendor.id, reason: "Vendor domain match" };
  }

  return { allowed: false, reason: "This email is not registered for the portal" };
}
