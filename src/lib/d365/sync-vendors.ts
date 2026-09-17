import { prisma } from "@/lib/prisma";
import { getD365Config } from "./config";
import { odataGetAll } from "./client";
import { mapVendor, type Row } from "./mappers";
import { finish, legalEntitiesOf } from "./sync-items";

/**
 * Pulls the vendor master from D365.
 *
 * A vendor account is matched on its account number alone, so the same account
 * appearing in two legal entities resolves to one portal vendor recorded
 * against both. If your account numbers are not shared across companies, this
 * assumption is wrong and the key needs the dataAreaId adding to it.
 *
 * Email domains, allow-listed addresses and the portal access switch are never
 * touched here. Those are portal concepts that D365 knows nothing about, so an
 * administrator owns them and a sync will not undo their work.
 */
export async function syncVendors(trigger: "manual" | "cron", triggeredBy?: string) {
  const cfg = await getD365Config();
  const run = await prisma.syncRun.create({ data: { type: "VENDORS", trigger, triggeredBy } });

  let processed = 0;
  let failed = 0;
  const problems: string[] = [];

  for (const dataAreaId of legalEntitiesOf(cfg.legalEntities)) {
    try {
      const rows = await odataGetAll<Row>(cfg, cfg.vendorEntity, {
        filter: `dataAreaId eq '${dataAreaId}'`,
        crossCompany: true,
      });

      const legalEntity = await prisma.legalEntity.findUnique({ where: { code: dataAreaId } });

      for (const row of rows) {
        const v = mapVendor(row);
        if (!v) continue;

        const vendor = await prisma.vendor.upsert({
          where: { code: v.code },
          create: {
            code: v.code,
            name: v.name,
            vendorGroupId: v.vendorGroupId,
            currency: v.currency,
            isBlocked: v.isBlocked,
            source: "D365",
            lastSyncedAt: new Date(),
            // New vendors arrive with no domains, so nobody can sign in as them
            // until an administrator adds one. Active by default is therefore safe.
            isActive: true,
          },
          update: {
            name: v.name,
            vendorGroupId: v.vendorGroupId,
            currency: v.currency,
            isBlocked: v.isBlocked,
            lastSyncedAt: new Date(),
          },
        });

        if (legalEntity) {
          await prisma.vendorLegalEntity.upsert({
            where: { vendorId_legalEntityId: { vendorId: vendor.id, legalEntityId: legalEntity.id } },
            create: { vendorId: vendor.id, legalEntityId: legalEntity.id },
            update: {},
          });
        }

        processed += 1;
      }
    } catch (err) {
      failed += 1;
      problems.push(`${dataAreaId}: ${(err as Error).message}`);
    }
  }

  // Rows synced before their vendor existed are now resolvable.
  await linkItemsToVendors();
  await linkTradeAgreementsToVendors();

  return finish(run.id, processed, failed, problems);
}

/**
 * Resolves Item.primaryVendorCode to a vendor row. Runs after either sync,
 * because the two entities can arrive in any order.
 */
export async function linkItemsToVendors(): Promise<number> {
  const unlinked = await prisma.item.findMany({
    where: { primaryVendorCode: { not: null }, primaryVendorId: null },
    select: { id: true, primaryVendorCode: true },
    take: 5000,
  });
  if (unlinked.length === 0) return 0;

  const codes = Array.from(new Set(unlinked.map((i) => i.primaryVendorCode!)));
  const vendors = await prisma.vendor.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const byCode = new Map(vendors.map((v) => [v.code, v.id]));

  let linked = 0;
  for (const item of unlinked) {
    const vendorId = byCode.get(item.primaryVendorCode!);
    if (!vendorId) continue;
    await prisma.item.update({ where: { id: item.id }, data: { primaryVendorId: vendorId } });
    linked += 1;
  }
  return linked;
}

/**
 * Resolves synced trade agreements to a vendor, by account code first and by
 * the item's default vendor second.
 */
export async function linkTradeAgreementsToVendors(): Promise<number> {
  const unlinked = await prisma.tradeAgreement.findMany({
    where: { vendorId: null },
    select: { id: true, vendorCode: true, item: { select: { primaryVendorId: true } } },
    take: 5000,
  });
  if (unlinked.length === 0) return 0;

  const codes = Array.from(new Set(unlinked.map((t) => t.vendorCode).filter(Boolean) as string[]));
  const vendors = codes.length
    ? await prisma.vendor.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } })
    : [];
  const byCode = new Map(vendors.map((v) => [v.code, v.id]));

  let linked = 0;
  for (const ta of unlinked) {
    const vendorId = (ta.vendorCode ? byCode.get(ta.vendorCode) : undefined) ?? ta.item?.primaryVendorId ?? null;
    if (!vendorId) continue;
    await prisma.tradeAgreement.update({ where: { id: ta.id }, data: { vendorId } });
    linked += 1;
  }
  return linked;
}
