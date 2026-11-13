"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { RfqVendorType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canAdminister, canApprove } from "@/lib/rbac";
import type { ActionState } from "./agreements";

/**
 * Questions are a Purchasing concern rather than an IT one, so approvers can
 * maintain them as well as administrators, the same as RFQ settings.
 */
async function requireQuestionEditor() {
  const user = await requireUser();
  if (!canApprove(user.role) && !canAdminister(user.role)) {
    throw new Error("Only approvers and administrators can change the questionnaire");
  }
  return user;
}

const VENDOR_TYPES: RfqVendorType[] = ["CM", "PRIMARY_PACK", "SECONDARY_PACK", "LABELS"];

const questionSchema = z.object({
  label: z.string().min(3, "Give the question a label"),
  type: z.enum(["TEXT", "LONGTEXT", "NUMBER", "YESNO", "CHOICE"]),
  unit: z.string().optional(),
  help: z.string().optional(),
  required: z.coerce.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

/** A readable, stable key derived from the label, uniquified if it collides. */
async function keyFrom(label: string): Promise<string> {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join("")
      .slice(0, 40) || "question";

  let candidate = base;
  let n = 2;
  while (await prisma.rfqQuestion.findUnique({ where: { key: candidate } })) {
    candidate = `${base}${n}`;
    n += 1;
  }
  return candidate;
}

export async function createQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    user = await requireQuestionEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }

  const parsed = questionSchema.safeParse({
    label: formData.get("label"),
    type: formData.get("type"),
    unit: formData.get("unit") || undefined,
    help: formData.get("help") || undefined,
    required: formData.get("required") === "on",
    sortOrder: formData.get("sortOrder") || 100,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const vendorTypes = formData.getAll("vendorTypes").map(String).filter((v): v is RfqVendorType =>
    VENDOR_TYPES.includes(v as RfqVendorType),
  );
  if (vendorTypes.length === 0) {
    return { error: "Choose at least one vendor type, or nobody will ever see this question" };
  }

  const options = String(formData.get("options") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (parsed.data.type === "CHOICE" && options.length < 2) {
    return { error: "A multiple choice question needs at least two options, comma separated" };
  }

  try {
    await prisma.rfqQuestion.create({
      data: {
        key: await keyFrom(parsed.data.label),
        label: parsed.data.label,
        type: parsed.data.type,
        source: "ANSWER",
        options,
        unit: parsed.data.unit ?? null,
        help: parsed.data.help ?? null,
        required: parsed.data.required,
        vendorTypes,
        sortOrder: parsed.data.sortOrder,
        updatedBy: user.email,
      },
    });
    revalidatePath("/admin/questions");
    return { ok: `Added "${parsed.data.label}".` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function updateQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    user = await requireQuestionEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (label.length < 3) return { error: "Give the question a label" };

  const vendorTypes = formData.getAll("vendorTypes").map(String).filter((v): v is RfqVendorType =>
    VENDOR_TYPES.includes(v as RfqVendorType),
  );
  if (vendorTypes.length === 0) {
    return { error: "Choose at least one vendor type, or nobody will ever see this question" };
  }

  try {
    await prisma.rfqQuestion.update({
      where: { id },
      data: {
        // The key is deliberately not editable: answers are stored against it,
        // and changing it would orphan every answer already given.
        label,
        unit: String(formData.get("unit") ?? "").trim() || null,
        help: String(formData.get("help") ?? "").trim() || null,
        required: formData.get("required") === "on",
        sortOrder: Number(formData.get("sortOrder") ?? 100),
        vendorTypes,
        options: String(formData.get("options") ?? "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
        updatedBy: user.email,
      },
    });
    revalidatePath("/admin/questions");
    return { ok: "Saved." };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function toggleQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireQuestionEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }

  const id = String(formData.get("id") ?? "");
  const current = await prisma.rfqQuestion.findUnique({ where: { id }, select: { isActive: true, label: true } });
  if (!current) return { error: "Not found" };

  await prisma.rfqQuestion.update({ where: { id }, data: { isActive: !current.isActive } });
  revalidatePath("/admin/questions");
  return {
    ok: current.isActive
      ? `"${current.label}" retired. It no longer appears on new quotations, and past answers are kept.`
      : `"${current.label}" is back in use.`,
  };
}

/**
 * Only deletes a question nobody has answered. Once answers exist, retiring is
 * the right move: deleting would leave orphaned answers that no longer render.
 */
export async function deleteQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireQuestionEditor();
  } catch (err) {
    return { error: (err as Error).message };
  }

  const id = String(formData.get("id") ?? "");
  const question = await prisma.rfqQuestion.findUnique({ where: { id }, select: { key: true, label: true } });
  if (!question) return { error: "Not found" };

  const answers = await prisma.bidAnswer.count({ where: { questionKey: question.key } });
  if (answers > 0) {
    return {
      error: `${answers} supplier${answers === 1 ? " has" : "s have"} answered this. Retire it instead, which hides it from new quotations and keeps what they said.`,
    };
  }

  await prisma.rfqQuestion.delete({ where: { id } });
  revalidatePath("/admin/questions");
  return { ok: `"${question.label}" deleted.` };
}
