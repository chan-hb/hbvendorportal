import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { UserAdmin } from "@/components/UserAdmin";

export default async function UsersPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    include: { vendor: { select: { name: true } } },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">Users and roles</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Approvers can action submitted agreements. Viewers see everything but cannot decide. An account has to
          exist before anyone can sign in, and the address must be recognised first.
        </p>
      </div>
      <UserAdmin
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          vendorName: u.vendor?.name ?? null,
          hasPassword: !!u.passwordHash,
          mustChangePassword: u.mustChangePassword,
          lockedUntil: u.lockedUntil?.toISOString() ?? null,
          failedLoginCount: u.failedLoginCount,
        }))}
      />
    </div>
  );
}
