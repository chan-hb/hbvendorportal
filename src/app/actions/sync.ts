"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { runSync, type SyncScope } from "@/lib/d365/run-sync";
import { getD365Config } from "@/lib/d365/config";
import { odataPing } from "@/lib/d365/client";
import type { ActionState } from "./agreements";

export async function runSyncAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const scope = (formData.get("scope") as SyncScope) ?? "all";
  const fullRefresh = formData.get("fullRefresh") === "on";
  const onlyDataAreaId = String(formData.get("onlyDataAreaId") ?? "") || undefined;
  try {
    await runSync(scope, "manual", user.email, { fullRefresh, onlyDataAreaId });
    revalidatePath("/admin/integration");
    revalidatePath("/items");
    revalidatePath("/agreements");
    return {
      ok: `Refresh finished for ${scope}${onlyDataAreaId ? ` in ${onlyDataAreaId.toUpperCase()}` : ""}. Check the sync log below; a partial run resumes on the next one.`,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function testConnectionAction(): Promise<ActionState> {
  await requireAdmin();
  try {
    const cfg = await getD365Config();
    await odataPing(cfg);
    return { ok: "Connected. The item entity responded." };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
