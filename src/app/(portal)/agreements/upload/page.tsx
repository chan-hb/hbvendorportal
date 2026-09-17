import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireVendor } from "@/lib/session";
import { PriceListUpload } from "@/components/PriceListUpload";
import { Panel } from "@/components/Panel";

export default async function PriceListPage() {
  const user = await requireVendor();
  const itemCount = await prisma.item.count({ where: { primaryVendorId: user.vendorId, isActive: true } });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/agreements" className="text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal/50 hover:text-pink">
          Back to agreements
        </Link>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight">Update prices in bulk</h1>
        <p className="mt-2 text-sm text-charcoal/60">
          Download your price list, change what needs changing, and upload it back. Each changed row becomes a
          request for approval exactly as if you had entered it by hand.
        </p>
      </div>

      {itemCount === 0 ? (
        <Panel>
          <p className="px-5 py-8 text-sm text-charcoal/70">
            No items are assigned to your account yet, so there is nothing to price. Contact your Huda Beauty buyer
            if that looks wrong.
          </p>
        </Panel>
      ) : (
        <Panel title={`${itemCount} item${itemCount === 1 ? "" : "s"} on your list`}>
          <PriceListUpload />
        </Panel>
      )}
    </div>
  );
}
