import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { canAdminister, canApprove, isInternal } from "@/lib/rbac";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Everything under (portal) goes through here, so this is the one place the
  // temporary password check has to live.
  if (user.mustChangePassword) redirect("/account/password");
  const internal = isInternal(user.role);

  const nav = [
    ...(internal ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    { href: "/agreements", label: internal ? "All agreements" : "My agreements" },
    { href: "/rfq", label: internal ? "RFQs" : "Invitations to quote" },
    { href: "/price-history", label: "Price history" },
    { href: "/items", label: "Item master" },
    ...(internal ? [{ href: "/local-items", label: "New items" }] : []),
    ...(canApprove(user.role) ? [{ href: "/admin/rfq-settings", label: "RFQ settings" }] : []),
    ...(canAdminister(user.role)
      ? [
          { href: "/admin/vendors", label: "Vendors" },
          { href: "/admin/users", label: "Users" },
          { href: "/admin/integration", label: "Integration" },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
          <Link
            href="/"
            className="font-display text-2xl uppercase leading-none tracking-[0.14em] text-charcoal transition hover:text-pink sm:text-3xl"
          >
            Huda Beauty
          </Link>

          <nav className="order-last flex w-full gap-6 border-t border-line pt-3 lg:order-none lg:w-auto lg:border-0 lg:pt-0">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal/70 hover:text-pink"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <Link
              href="/account/password"
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal/60 hover:text-pink"
            >
              Password
            </Link>
            <div className="text-right leading-tight">
              <p className="text-xs font-semibold text-charcoal">{user.email}</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-charcoal/50">
                {user.vendorName ?? roleLabel(user.role)}
                {canApprove(user.role) ? " . Approver" : ""}
              </p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal/60 hover:text-pink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
    </div>
  );
}

function roleLabel(role: string) {
  return (
    { HB_ADMIN: "Administrator", HB_APPROVER: "Approver", HB_USER: "Huda Beauty", VENDOR: "Vendor" } as Record<
      string,
      string
    >
  )[role] ?? role;
}
