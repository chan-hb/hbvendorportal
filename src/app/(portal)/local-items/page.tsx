import { prisma } from "@/lib/prisma";
import { requireInternal } from "@/lib/session";
import { LocalItemAdmin } from "@/components/LocalItemAdmin";

export default async function LocalItemsPage() {
  await requireInternal();

  const items = await prisma.localItem.findMany({
    include: { createdBy: { select: { email: true } }, _count: { select: { rfqs: true } } },
    orderBy: { createdAt: "desc" },
  });

  // An ERP number can be recorded before the master data sync brings the row
  // across, so the two states are shown differently rather than treated as one.
  const numbers = items.map((i) => i.erpItemNumber).filter(Boolean) as string[];
  const inMaster = new Set(
    (await prisma.item.findMany({ where: { itemNumber: { in: numbers } }, select: { itemNumber: true } })).map(
      (i) => i.itemNumber,
    ),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Sourcing</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">Items not yet in the ERP</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Create something here to start an RFQ before the item exists in Dynamics 365, then record the ERP number
          once it has been created.
        </p>
      </div>

      <LocalItemAdmin
        items={items.map((i) => ({
          id: i.id,
          localCode: i.localCode,
          name: i.name,
          description: i.description,
          category: i.category,
          unit: i.unit,
          erpItemNumber: i.erpItemNumber,
          erpLinkedAt: i.erpLinkedAt?.toISOString() ?? null,
          createdByEmail: i.createdBy.email,
          createdAt: i.createdAt.toISOString(),
          rfqCount: i._count.rfqs,
          inMaster: !!i.erpItemNumber && inMaster.has(i.erpItemNumber),
        }))}
      />
    </div>
  );
}
