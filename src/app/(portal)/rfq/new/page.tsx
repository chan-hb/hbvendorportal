import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/lib/session";
import { createRfqAction } from "@/app/actions/rfq";
import { RfqForm } from "@/components/RfqForm";
import { DEFAULT_TIERS, getRfqSettings } from "@/lib/rfq/service";
import { Panel } from "@/components/Panel";

export default async function NewRfqPage() {
  await requireInternal();

  const [legalEntities, localItems, settings] = await Promise.all([
    prisma.legalEntity.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.localItem.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, localCode: true, name: true, unit: true, erpItemNumber: true },
    }),
    getRfqSettings(),
  ]);

  const standardTiers = settings.standardTiers.length
    ? settings.standardTiers.map((t) => Number(t))
    : DEFAULT_TIERS;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/rfq" className="text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal/50 hover:text-pink">
          Back to RFQs
        </Link>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight">New request for quotation</h1>
        <p className="mt-2 text-sm text-charcoal/60">
          Pick an item from the master, or one you created locally because it does not exist in the ERP yet. You
          invite vendors on the next screen.
        </p>
      </div>

      <Panel>
        <RfqForm
          action={createRfqAction}
          legalEntities={legalEntities.map((le) => ({ code: le.code, name: le.name, currency: le.currency }))}
          localItems={localItems}
          standardTiers={standardTiers}
          defaultPaymentTerms={settings.defaultPaymentTerms}
          defaultIncoterm={settings.defaultIncoterm}
        />
      </Panel>
    </div>
  );
}
