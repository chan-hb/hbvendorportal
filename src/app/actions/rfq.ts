"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import type { Actor } from "@/lib/agreements";
import {
  addProvisionalVendor,
  awardRfq,
  closeRfq,
  createLocalItem,
  createRfq,
  declineInvitation,
  getRfqSettings,
  inviteVendors,
  linkLocalItemToErp,
  linkProvisionalVendor,
  RFQ_SETTINGS_ID,
  submitBid,
} from "@/lib/rfq/service";
import { notifyAwardOutcome } from "@/lib/rfq/notifications";
import type { ActionState } from "./agreements";

async function actor(): Promise<Actor> {
  const u = await requireUser();
  return { id: u.id, email: u.email, role: u.role, vendorId: u.vendorId };
}

// ---------------------------------------------------------------- local items

const localItemSchema = z.object({
  name: z.string().min(2, "Give the item a name"),
  description: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().optional(),
  targetPrice: z.coerce.number().nonnegative().optional(),
  currency: z.string().optional(),
});

export async function createLocalItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = localItemSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
    unit: formData.get("unit") || undefined,
    targetPrice: formData.get("targetPrice") || undefined,
    currency: formData.get("currency") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const item = await createLocalItem(await actor(), parsed.data);
    revalidatePath("/local-items");
    return { ok: `Created ${item.localCode}` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function linkLocalItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const { updated, foundInMaster } = await linkLocalItemToErp(
      await actor(),
      String(formData.get("localItemId")),
      String(formData.get("erpItemNumber") ?? ""),
    );
    revalidatePath("/local-items");
    return {
      ok: foundInMaster
        ? `${updated.localCode} is now linked to ${updated.erpItemNumber}`
        : `${updated.localCode} linked to ${updated.erpItemNumber}. That number is not in the item master yet, so it will match after the next sync.`,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ---------------------------------------------------------------- rfq

const rfqSchema = z
  .object({
    title: z.string().min(3, "Give the RFQ a title"),
    dataAreaId: z.string().min(1, "Choose a legal entity"),
    currency: z.string().length(3).toUpperCase(),
    itemSource: z.enum(["ERP", "LOCAL"]),
    itemNumber: z.string().optional(),
    localItemId: z.string().optional(),
    targetQuantity: z.coerce.number().positive("Quantity must be greater than zero"),
    unit: z.string().optional(),
    requiredByDate: z.string().optional(),
    closesAt: z.coerce.date(),
    notes: z.string().optional(),
    requestedPaymentTerms: z.string().optional(),
    requestedIncoterm: z.string().optional(),
    weightPrice: z.coerce.number().int().min(0).max(100),
    weightLeadTime: z.coerce.number().int().min(0).max(100),
    weightCapacity: z.coerce.number().int().min(0).max(100),
    weightReliability: z.coerce.number().int().min(0).max(100),
  })
  .refine((v) => v.weightPrice + v.weightLeadTime + v.weightCapacity + v.weightReliability > 0, {
    message: "At least one scoring weight must be above zero",
    path: ["weightPrice"],
  });

export async function createRfqAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = rfqSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const tiers = formData
    .getAll("quantityTiers")
    .map((t) => Number(String(t)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (tiers.length === 0) return { error: "Choose at least one quantity break to be priced" };

  const requiredBy = parsed.data.requiredByDate ? new Date(parsed.data.requiredByDate) : null;

  try {
    const me = await actor();
    const rfq = await createRfq(me, {
      ...parsed.data,
      quantityTiers: tiers,
      requiredByDate: requiredBy && !Number.isNaN(requiredBy.getTime()) ? requiredBy : null,
    });

    // The brief travels with the RFQ, so it is stored before anyone is invited.
    const files = formData.getAll("brief").filter((f): f is File => f instanceof File && f.size > 0);
    for (const file of files) {
      if (file.size > 8_000_000) continue;
      await prisma.rfqAttachment.create({
        data: {
          rfqId: rfq.id,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          data: Buffer.from(await file.arrayBuffer()),
          uploadedBy: me.email,
        },
      });
    }
    revalidatePath("/rfq");
    redirect(`/rfq/${rfq.id}`);
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
    return { error: (err as Error).message };
  }
}

export async function inviteVendorsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId"));
  const vendorIds = formData.getAll("vendorIds").map(String).filter(Boolean);
  if (vendorIds.length === 0) return { error: "Select at least one vendor" };

  try {
    const results = await inviteVendors(await actor(), rfqId, vendorIds);
    revalidatePath(`/rfq/${rfqId}`);

    const sent = results.filter((r) => r.sent).length;
    const problems = results.filter((r) => !r.sent && r.message);
    return {
      ok:
        `Invited ${results.length} vendor${results.length === 1 ? "" : "s"}, ${sent} email${sent === 1 ? "" : "s"} sent.` +
        (problems.length ? ` Not emailed: ${problems.map((p) => p.message).join("; ")}` : ""),
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function addWatcherAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId"));
  const userId = String(formData.get("userId"));
  try {
    await prisma.rfqWatcher.upsert({
      where: { rfqId_userId: { rfqId, userId } },
      create: { rfqId, userId },
      update: {},
    });
    revalidatePath(`/rfq/${rfqId}`);
    return { ok: "Added to the notification list" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function removeWatcherAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId"));
  const userId = String(formData.get("userId"));
  await prisma.rfqWatcher.delete({ where: { rfqId_userId: { rfqId, userId } } }).catch(() => {});
  revalidatePath(`/rfq/${rfqId}`);
  return { ok: "Removed" };
}

// ---------------------------------------------------------------- bids

export async function submitBidAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId"));
  const asDraft = formData.get("intent") === "draft";

  const quantities = formData.getAll("quantity").map(String);
  const prices = formData.getAll("unitPrice").map(String);
  const lineNotes = formData.getAll("lineNotes").map(String);

  const lines = [];
  const seen = new Set<number>();

  for (let i = 0; i < quantities.length; i += 1) {
    // A tier left unpriced simply is not offered, which is legitimate: a
    // supplier may not want the 500,000 volume at all.
    if (!prices[i]?.trim()) continue;

    const quantity = Number(quantities[i]);
    const unitPrice = Number(prices[i]);

    if (!(quantity > 0)) return { error: `Row ${i + 1}: quantity must be greater than zero` };
    if (!(unitPrice > 0)) return { error: `Row ${i + 1}: price must be greater than zero` };
    if (seen.has(quantity)) return { error: `Quantity ${quantity.toLocaleString()} is priced twice` };
    seen.add(quantity);

    lines.push({ quantity, unitPrice, notes: lineNotes[i] || undefined });
  }

  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const date = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  try {
    await submitBid(
      await actor(),
      rfqId,
      lines,
      {
        quotationDate: date("quotationDate"),
        validUntil: date("validUntil"),
        leadTimeDays: num("leadTimeDays"),
        weeklyCapacity: num("weeklyCapacity"),
        moq: num("moq"),
        paymentTerms: String(formData.get("paymentTerms") ?? "") || undefined,
        incoterm: String(formData.get("incoterm") ?? "") || undefined,
        notes: String(formData.get("notes") ?? "") || undefined,
      },
      asDraft,
    );
    revalidatePath(`/rfq/${rfqId}`);
    return { ok: asDraft ? "Saved as a draft" : "Quotation submitted" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function declineInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId"));
  try {
    await declineInvitation(await actor(), rfqId, String(formData.get("note") ?? "") || undefined);
    revalidatePath(`/rfq/${rfqId}`);
    return { ok: "Thanks, we have recorded that you are not quoting" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ---------------------------------------------------------------- award

export async function awardRfqAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId"));
  const bidId = String(formData.get("bidId"));
  const reason = String(formData.get("reason") ?? "") || undefined;

  try {
    const me = await actor();
    const bid = await awardRfq(me, rfqId, bidId, reason);
    await notifyAwardOutcome(rfqId, me.email);
    revalidatePath(`/rfq/${rfqId}`);
    return { ok: `Awarded to ${bid.vendor.name}. All bidders have been told the outcome.` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function closeRfqAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId"));
  try {
    await closeRfq(await actor(), rfqId);
    revalidatePath(`/rfq/${rfqId}`);
    return { ok: "RFQ closed to further quotations" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ---------------------------------------------------------------- provisional vendors

export async function addProvisionalVendorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") ?? "");
  const contactName = String(formData.get("contactName") ?? "") || undefined;
  const email = String(formData.get("email") ?? "");
  const rfqId = String(formData.get("rfqId") ?? "");

  try {
    const me = await actor();
    const { vendor, warning, setupSent } = await addProvisionalVendor(me, { name, contactName, email });

    // Adding one from an RFQ screen means they should be invited to it.
    if (rfqId) {
      const results = await inviteVendors(me, rfqId, [vendor.id]);
      revalidatePath(`/rfq/${rfqId}`);
      const sent = results[0]?.sent;
      return {
        ok:
          `${vendor.name} added as ${vendor.code} and invited.` +
          (sent ? " The invitation has been emailed." : ` The invitation could not be emailed: ${results[0]?.message}`) +
          (setupSent
            ? " They have also been sent a link to set their password."
            : " Send them a password set-up link from the Users page, or they will not be able to sign in.") +
          (warning ? ` ${warning}` : ""),
      };
    }

    revalidatePath("/admin/vendors");
    return {
      ok:
        `${vendor.name} added as ${vendor.code}.` +
        (setupSent ? " A password set-up link has been emailed." : " Send them a set-up link from the Users page.") +
        (warning ? ` ${warning}` : ""),
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function linkProvisionalVendorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const real = await linkProvisionalVendor(
      await actor(),
      String(formData.get("vendorId")),
      String(formData.get("realCode") ?? ""),
    );
    revalidatePath("/admin/vendors");
    return { ok: `Merged into ${real.name} (${real.code}). Users, quotations and agreements moved across.` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ---------------------------------------------------------------- rfq settings

export async function saveRfqSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await actor();
  if (me.role !== "HB_ADMIN" && me.role !== "HB_APPROVER") {
    return { error: "Only approvers and administrators can change these" };
  }

  const fromEmail = String(formData.get("fromEmail") ?? "").trim().toLowerCase();
  const replyTo = String(formData.get("replyTo") ?? "").trim().toLowerCase();
  if (fromEmail && !fromEmail.includes("@")) return { error: "The sending address is not a valid email" };

  const tiers = String(formData.get("standardTiers") ?? "")
    .split(",")
    .map((t) => Number(t.trim().replace(/[, ]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  try {
    await getRfqSettings();
    await prisma.rfqSetting.update({
      where: { id: RFQ_SETTINGS_ID },
      data: {
        fromName: String(formData.get("fromName") ?? "").trim() || "Huda Beauty Sourcing",
        fromEmail: fromEmail || null,
        replyTo: replyTo || null,
        ccEmails: String(formData.get("ccEmails") ?? "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes("@")),
        standardTiers: tiers,
        defaultPaymentTerms: String(formData.get("defaultPaymentTerms") ?? "").trim() || null,
        defaultIncoterm: String(formData.get("defaultIncoterm") ?? "").trim() || null,
        updatedBy: me.email,
      },
    });
    revalidatePath("/admin/rfq-settings");
    return {
      ok: fromEmail
        ? `Saved. RFQ email will come from ${fromEmail}, which must be on a domain verified with your mail provider or sending will be rejected.`
        : "Saved. With no sending address set, RFQ email falls back to the default EMAIL_FROM.",
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ---------------------------------------------------------------- attachments

export async function addAttachmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId"));
  const files = formData.getAll("brief").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose a file" };

  try {
    const me = await actor();
    for (const file of files) {
      if (file.size > 8_000_000) {
        return { error: `${file.name} is larger than 8 MB. Link to it instead, or compress it.` };
      }
      await prisma.rfqAttachment.create({
        data: {
          rfqId,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          data: Buffer.from(await file.arrayBuffer()),
          uploadedBy: me.email,
        },
      });
    }
    revalidatePath(`/rfq/${rfqId}`);
    return { ok: `Attached ${files.map((f) => f.name).join(", ")}` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function removeAttachmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rfqId = String(formData.get("rfqId"));
  await prisma.rfqAttachment.delete({ where: { id: String(formData.get("id")) } }).catch(() => {});
  revalidatePath(`/rfq/${rfqId}`);
  return { ok: "Removed" };
}
