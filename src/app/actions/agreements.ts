"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { agreementInput, decisionInput } from "@/lib/validation";
import { createAgreement, decide, resubmit, type Actor } from "@/lib/agreements";

export type ActionState = { error?: string; ok?: string } | null;

async function actor(): Promise<Actor> {
  const u = await requireUser();
  return { id: u.id, email: u.email, role: u.role, vendorId: u.vendorId };
}

function parse(formData: FormData) {
  return agreementInput.safeParse({
    dataAreaId: formData.get("dataAreaId"),
    itemNumber: formData.get("itemNumber"),
    currency: formData.get("currency"),
    amount: formData.get("amount"),
    unit: formData.get("unit") || undefined,
    fromDate: formData.get("fromDate"),
    toDate: formData.get("toDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function createAgreementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const submit = formData.get("intent") !== "draft";
  try {
    const created = await createAgreement(await actor(), parsed.data, submit);
    revalidatePath("/agreements");
    redirect(`/agreements/${created.id}`);
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
    return { error: (err as Error).message };
  }
}

export async function resubmitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("agreementId"));
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await resubmit(await actor(), id, parsed.data);
    revalidatePath(`/agreements/${id}`);
    return { ok: "Sent back for review" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function decisionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = decisionInput.safeParse({
    agreementId: formData.get("agreementId"),
    decision: formData.get("decision"),
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await decide(await actor(), parsed.data.agreementId, parsed.data.decision, parsed.data.comment);
    revalidatePath(`/agreements/${parsed.data.agreementId}`);
    revalidatePath("/agreements");
    return { ok: "Decision recorded" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
