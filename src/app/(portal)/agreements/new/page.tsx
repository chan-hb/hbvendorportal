import { prisma } from "@/lib/prisma";
import { requireVendor } from "@/lib/session";
import { createAgreementAction } from "@/app/actions/agreements";
import { AgreementForm } from "@/components/AgreementForm";
import { Panel } from "@/components/Panel";

const FALLBACK_CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR"];

export default async function NewAgreementPage() {
  const user = await requireVendor();

  // A vendor may only raise agreements in the entities they trade with.
  const mappings = await prisma.vendorLegalEntity.findMany({
    where: { vendorId: user.vendorId },
    include: { legalEntity: true },
  });
  const legalEntities = mappings.length
    ? mappings.map((m) => m.legalEntity)
    : await prisma.legalEntity.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });

  const currencies = Array.from(
    new Set([...legalEntities.map((le) => le.currency).filter(Boolean) as string[], ...FALLBACK_CURRENCIES]),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">{user.vendorName}</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">New trade agreement</h1>
        <p className="mt-2 text-sm text-charcoal/60">
          Pick the item, set the price and the date it takes effect. A Huda Beauty approver reviews it before
          anything reaches Dynamics 365.
        </p>
      </div>

      <Panel>
        <div className="p-6">
          <AgreementForm
            mode="create"
            action={createAgreementAction}
            legalEntities={legalEntities.map((le) => ({ code: le.code, name: le.name, currency: le.currency }))}
            currencies={currencies}
          />
        </div>
      </Panel>
    </div>
  );
}
