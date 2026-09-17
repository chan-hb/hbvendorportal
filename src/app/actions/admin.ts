"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import type { Role } from "@prisma/client";
import type { ActionState } from "./agreements";

/**
 * Vendor code and name are owned by the D365 sync. An administrator only
 * controls the two portal concepts: which email domains map here, and whether
 * the vendor can sign in at all.
 */
export async function updateVendorAccessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const domains = String(formData.get("domains") ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  const isActive = formData.get("isActive") === "on";

  if (!id) return { error: "No vendor selected" };

  // A domain must not map to two vendors, or sign-in becomes ambiguous.
  for (const domain of domains) {
    const clash = await prisma.vendor.findFirst({
      where: { domains: { has: domain }, NOT: { id } },
      select: { name: true, code: true },
    });
    if (clash) {
      return { error: `${domain} is already mapped to ${clash.name} (${clash.code})` };
    }
  }

  try {
    const vendor = await prisma.vendor.update({
      where: { id },
      data: { domains, isActive },
      select: { name: true },
    });
    revalidatePath("/admin/vendors");
    return { ok: `Saved access for ${vendor.name}` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function addAllowedEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const vendorId = String(formData.get("vendorId") ?? "");
  if (!email.includes("@") || !vendorId) return { error: "Provide an email and choose a vendor" };

  try {
    await prisma.allowedEmail.upsert({
      where: { email },
      create: { email, vendorId },
      update: { vendorId },
    });
    // Re-point an existing user record if this person has an account already.
    const { count } = await prisma.user.updateMany({
      where: { email },
      data: { vendorId, role: "VENDOR" },
    });

    if (count > 0) {
      revalidatePath("/admin/vendors");
      return { ok: `${email} is now mapped to that vendor.` };
    }

    // Allow-listing is permission to hold an account, not an account. Create
    // one and send the set-up link, so the address actually works.
    try {
      const { createUserAccount, sendSetupLink } = await import("@/lib/accounts");
      const user = await createUserAccount("system", { email });
      const result = await sendSetupLink(user.id);
      revalidatePath("/admin/vendors");
      return {
        ok: result.sent
          ? `${email} can now sign in. A link to set their password has been emailed.`
          : `${email} is allow-listed and an account created, but the email failed (${result.error ?? result.skipped}). Send a link or a temporary password from the Users page.`,
      };
    } catch (err) {
      revalidatePath("/admin/vendors");
      return { ok: `${email} is allow-listed. Create their account on the Users page. (${(err as Error).message})` };
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function removeAllowedEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await prisma.allowedEmail.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/vendors");
  return { ok: "Removed" };
}

export async function setUserRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (userId === admin.id) return { error: "You cannot change your own role" };

  try {
    await prisma.user.update({ where: { id: userId }, data: { role } });
    revalidatePath("/admin/users");
    return { ok: "Role updated" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function toggleUserActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (userId === admin.id) return { error: "You cannot deactivate yourself" };
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  await prisma.user.update({ where: { id: userId }, data: { isActive: !current?.isActive } });
  revalidatePath("/admin/users");
  return { ok: "Updated" };
}
