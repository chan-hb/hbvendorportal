import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { VendorAdmin } from "@/components/VendorAdmin";

export default async function VendorsPage() {
  await requireAdmin();
  const vendors = await prisma.vendor.findMany({
    include: {
      allowedEmails: { select: { id: true, email: true }, orderBy: { email: "asc" } },
      _count: { select: { users: true, agreements: true, items: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-[0.02em] text-black">Vendors and access</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          The list comes from the Dynamics 365 vendor master. Add the email domains a supplier signs in
          from, and every non Huda Beauty user on that domain is scoped to their records only.
        </p>
      </div>
      <VendorAdmin vendors={vendors} />
    </div>
  );
}
