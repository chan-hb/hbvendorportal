import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export type D365Config = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  resourceUrl: string;
  scope: string;
  vendorEntity: string;
  itemEntity: string;
  tradeAgreementEntity: string;
  pushEntity: string;
  legalEntities: string[];
  pageSize: number;
  incrementalEnabled: boolean;
  modifiedDateField: string;
  itemFilter: string | null;
  tradeAgreementFilter: string | null;
  timeBudgetSeconds: number;
};

export const SETTINGS_ID = "default";

export async function getRawSettings() {
  return prisma.integrationSetting.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}

/** Returns a fully resolved config or throws with a message safe to show an admin. */
export async function getD365Config(): Promise<D365Config> {
  const s = await getRawSettings();
  const missing: string[] = [];
  if (!s.tenantId) missing.push("Tenant ID");
  if (!s.clientId) missing.push("Client ID");
  if (!s.clientSecretEnc) missing.push("Client secret");
  if (!s.resourceUrl) missing.push("Environment URL");
  if (missing.length) throw new Error(`Integration is not configured. Missing: ${missing.join(", ")}`);

  const resourceUrl = s.resourceUrl!.replace(/\/+$/, "");
  return {
    tenantId: s.tenantId!,
    clientId: s.clientId!,
    clientSecret: decrypt(s.clientSecretEnc!),
    resourceUrl,
    scope: s.scopeOverride?.trim() || `${resourceUrl}/.default`,
    vendorEntity: s.vendorEntity,
    itemEntity: s.itemEntity,
    tradeAgreementEntity: s.tradeAgreementEntity,
    pushEntity: s.pushEntity,
    legalEntities: s.legalEntities,
    pageSize: s.pageSize,
    incrementalEnabled: s.incrementalEnabled,
    modifiedDateField: s.modifiedDateField,
    itemFilter: s.itemFilter,
    tradeAgreementFilter: s.tradeAgreementFilter,
    timeBudgetSeconds: s.timeBudgetSeconds,
  };
}
