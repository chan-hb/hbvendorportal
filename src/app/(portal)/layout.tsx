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
      <div className="promo-bar">Supplier portal</div>

      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-4">
          <Link href="/" className="shrink-0 transition hover:opacity-70" aria-label="Huda Beauty, home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/hb-logo.png" alt="Huda Beauty" width={160} height={28} className="h-5 w-auto sm:h-6" />
          </Link>

          <div className="ml-auto flex items-center gap-5">
            <Link
              href="/account/password"
              className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-muted hover:text-pink sm:block"
            >
              Password
            </Link>
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-xs font-semibold text-charcoal">{user.email}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
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
              <button className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted hover:text-pink">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* Navigation sits on its own line, centred, the way the storefront
            separates the wordmark from the category row. */}
        <nav className="border-t border-line">
          <div className="mx-auto flex max-w-[1400px] gap-7 overflow-x-auto px-6 py-3">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.16em] text-charcoal transition hover:text-pink"
              >
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-10">{children}</main>
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
