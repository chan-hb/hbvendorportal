"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { requireAdmin } from "@/lib/session";
import { integrationInput } from "@/lib/validation";
import { SETTINGS_ID } from "@/lib/d365/config";
import { clearTokenCache } from "@/lib/d365/token";
import type { ActionState } from "./agreements";

export async function saveIntegrationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();

  const parsed = integrationInput.safeParse({
    tenantId: formData.get("tenantId"),
    clientId: formData.get("clientId"),
    clientSecret: formData.get("clientSecret") || undefined,
    resourceUrl: formData.get("resourceUrl"),
    scopeOverride: formData.get("scopeOverride") || undefined,
    vendorEntity: formData.get("vendorEntity"),
    itemEntity: formData.get("itemEntity"),
    tradeAgreementEntity: formData.get("tradeAgreementEntity"),
    pushEntity: formData.get("pushEntity"),
    legalEntities: formData.get("legalEntities") ?? "",
    pageSize: formData.get("pageSize"),
    incrementalEnabled: formData.get("incrementalEnabled") === "on",
    modifiedDateField: formData.get("modifiedDateField"),
    itemFilter: formData.get("itemFilter") || undefined,
    tradeAgreementFilter: formData.get("tradeAgreementFilter") || undefined,
    timeBudgetSeconds: formData.get("timeBudgetSeconds"),
    cronEnabled: formData.get("cronEnabled") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const v = parsed.data;
  const legalEntities = v.legalEntities
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  try {
    await prisma.integrationSetting.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        tenantId: v.tenantId,
        clientId: v.clientId,
        clientSecretEnc: v.clientSecret ? encrypt(v.clientSecret) : null,
        resourceUrl: v.resourceUrl,
        scopeOverride: v.scopeOverride,
        vendorEntity: v.vendorEntity,
        itemEntity: v.itemEntity,
        tradeAgreementEntity: v.tradeAgreementEntity,
        pushEntity: v.pushEntity,
        legalEntities,
        pageSize: v.pageSize,
        incrementalEnabled: v.incrementalEnabled,
        modifiedDateField: v.modifiedDateField,
        itemFilter: v.itemFilter ?? null,
        tradeAgreementFilter: v.tradeAgreementFilter ?? null,
        timeBudgetSeconds: v.timeBudgetSeconds,
        cronEnabled: v.cronEnabled,
        updatedBy: user.email,
      },
      update: {
        tenantId: v.tenantId,
        clientId: v.clientId,
        ...(v.clientSecret ? { clientSecretEnc: encrypt(v.clientSecret) } : {}),
        resourceUrl: v.resourceUrl,
        scopeOverride: v.scopeOverride,
        vendorEntity: v.vendorEntity,
        itemEntity: v.itemEntity,
        tradeAgreementEntity: v.tradeAgreementEntity,
        pushEntity: v.pushEntity,
        legalEntities,
        pageSize: v.pageSize,
        incrementalEnabled: v.incrementalEnabled,
        modifiedDateField: v.modifiedDateField,
        itemFilter: v.itemFilter ?? null,
        tradeAgreementFilter: v.tradeAgreementFilter ?? null,
        timeBudgetSeconds: v.timeBudgetSeconds,
        cronEnabled: v.cronEnabled,
        updatedBy: user.email,
      },
    });

    // Keep the legal entity list in step with what the sync will touch.
    for (const code of legalEntities) {
      await prisma.legalEntity.upsert({
        where: { code },
        create: { code, name: code.toUpperCase() },
        update: { isActive: true },
      });
    }

    clearTokenCache();
    revalidatePath("/admin/integration");
    return { ok: "Integration settings saved" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
