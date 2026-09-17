import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAdminister, canApprove, isInternal } from "@/lib/rbac";

export type AppSession = NonNullable<Awaited<ReturnType<typeof auth>>>;

export async function requireUser() {
  const session = await auth();
  // An empty id means the session survived but the account did not, which is
  // what a deactivated user looks like on an unexpired token.
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

/**
 * Anyone on a temporary password is sent to change it before they can use the
 * portal. Applied in the portal layout rather than in middleware, because
 * middleware has no database access in the Edge runtime.
 */
export async function requireCurrentPassword(pathname: string) {
  const user = await requireUser();
  if (user.mustChangePassword && !pathname.startsWith("/account/password")) {
    redirect("/account/password");
  }
  return user;
}

export async function requireInternal() {
  const user = await requireUser();
  if (!isInternal(user.role)) redirect("/agreements");
  return user;
}

export async function requireApprover() {
  const user = await requireUser();
  if (!canApprove(user.role)) redirect("/agreements");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!canAdminister(user.role)) redirect("/agreements");
  return user;
}

export async function requireVendor() {
  const user = await requireUser();
  if (user.role !== "VENDOR" || !user.vendorId) redirect("/agreements");
  return { ...user, vendorId: user.vendorId as string };
}
