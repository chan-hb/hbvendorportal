import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isInternal } from "@/lib/rbac";
import type { Actor } from "@/lib/agreements";
import { computeMetrics, scoreBids, type BidWithLines, type VendorHistory } from "./scoring";
import { notifyAllBidsIn, notifyVendorInvited } from "./notifications";

// ---------------------------------------------------------------- references

async function nextSequential(model: "rfq" | "localItem"): Promise<string> {
  const year = new Date().getUTCFullYear();
  if (model === "rfq") {
    const prefix = `RFQ-${year}-`;
    const last = await prisma.rfq.findFirst({
      where: { reference: { startsWith: prefix } },
      orderBy: { reference: "desc" },
      select: { reference: true },
    });
    const n = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
    return prefix + String(n).padStart(6, "0");
  }
  const prefix = `LOC-${year}-`;
  const last = await prisma.localItem.findFirst({
    where: { localCode: { startsWith: prefix } },
    orderBy: { localCode: "desc" },
    select: { localCode: true },
  });
  const n = last ? Number(last.localCode.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(6, "0");
}

// ---------------------------------------------------------------- local items

export async function createLocalItem(
  actor: Actor,
  input: { name: string; description?: string; category?: string; unit?: string; targetPrice?: number; currency?: string },
) {
  if (!isInternal(actor.role)) throw new Error("Only Huda Beauty users can create items");
  return prisma.localItem.create({
    data: {
      localCode: await nextSequential("localItem"),
      name: input.name,
      description: input.description,
      category: input.category,
      unit: input.unit,
      targetPrice: input.targetPrice,
      currency: input.currency,
      createdById: actor.id,
    },
  });
}

/** Records the ERP number once the item finally exists in D365. */
export async function linkLocalItemToErp(actor: Actor, localItemId: string, erpItemNumber: string) {
  if (!isInternal(actor.role)) throw new Error("Not permitted");

  const trimmed = erpItemNumber.trim();
  if (!trimmed) throw new Error("Enter the ERP item number");

  const clash = await prisma.localItem.findFirst({
    where: { erpItemNumber: trimmed, NOT: { id: localItemId } },
    select: { localCode: true },
  });
  if (clash) throw new Error(`${trimmed} is already linked to ${clash.localCode}`);

  // A warning, not a blocker: the item may legitimately not have synced yet.
  const known = await prisma.item.findFirst({ where: { itemNumber: trimmed }, select: { id: true } });

  const updated = await prisma.localItem.update({
    where: { id: localItemId },
    data: { erpItemNumber: trimmed, erpLinkedAt: new Date(), erpLinkedBy: actor.email },
  });

  return { updated, foundInMaster: !!known };
}

// ---------------------------------------------------------------- rfq

export type RfqInput = {
  title: string;
  dataAreaId: string;
  currency: string;
  itemSource: "ERP" | "LOCAL";
  itemNumber?: string;
  localItemId?: string;
  targetQuantity: number;
  unit?: string;
  quantityTiers: number[];
  requiredByDate?: Date | null;
  closesAt: Date;
  notes?: string;
  requestedPaymentTerms?: string;
  requestedIncoterm?: string;
  weightPrice: number;
  weightLeadTime: number;
  weightCapacity: number;
  weightReliability: number;
};

export async function createRfq(actor: Actor, input: RfqInput) {
  if (!isInternal(actor.role)) throw new Error("Only Huda Beauty users can raise an RFQ");

  if (input.itemSource === "ERP") {
    if (!input.itemNumber) throw new Error("Choose an item");
    const item = await prisma.item.findFirst({ where: { itemNumber: input.itemNumber } });
    if (!item) throw new Error(`Item ${input.itemNumber} is not in the item master`);
  } else if (!input.localItemId) {
    throw new Error("Choose a local item, or create one first");
  }

  const rfq = await prisma.rfq.create({
    data: {
      reference: await nextSequential("rfq"),
      title: input.title,
      dataAreaId: input.dataAreaId,
      currency: input.currency,
      itemSource: input.itemSource,
      itemNumber: input.itemSource === "ERP" ? input.itemNumber : null,
      localItemId: input.itemSource === "LOCAL" ? input.localItemId : null,
      targetQuantity: input.targetQuantity,
      unit: input.unit,
      quantityTiers: input.quantityTiers,
      requiredByDate: input.requiredByDate ?? null,
      closesAt: input.closesAt,
      notes: input.notes,
      requestedPaymentTerms: input.requestedPaymentTerms,
      requestedIncoterm: input.requestedIncoterm,
      weightPrice: input.weightPrice,
      weightLeadTime: input.weightLeadTime,
      weightCapacity: input.weightCapacity,
      weightReliability: input.weightReliability,
      createdById: actor.id,
      events: { create: { type: "CREATED", actorEmail: actor.email, detail: input.title } },
    },
  });

  return rfq;
}

/** Invites vendors and emails each of them. Re-inviting an existing vendor is a no-op. */
export async function inviteVendors(actor: Actor, rfqId: string, vendorIds: string[]) {
  if (!isInternal(actor.role)) throw new Error("Not permitted");

  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } });
  if (rfq.status === "AWARDED" || rfq.status === "CANCELLED") {
    throw new Error("This RFQ is closed to new invitations");
  }

  const results: { vendorId: string; sent: boolean; message?: string }[] = [];

  for (const vendorId of vendorIds) {
    const existing = await prisma.rfqInvitation.findUnique({
      where: { rfqId_vendorId: { rfqId, vendorId } },
    });
    if (existing) {
      results.push({ vendorId, sent: false, message: "Already invited" });
      continue;
    }

    await prisma.rfqInvitation.create({ data: { rfqId, vendorId, invitedBy: actor.email } });
    await prisma.rfqEvent.create({
      data: { rfqId, type: "VENDOR_INVITED", actorEmail: actor.email, detail: vendorId },
    });

    const mail = await notifyVendorInvited(rfqId, vendorId, actor.email);
    results.push({ vendorId, sent: !!mail.sent, message: mail.error ?? mail.skipped });
  }

  // Inviting anyone opens the RFQ, since a draft is not visible to vendors.
  if (rfq.status === "DRAFT" && results.length > 0) {
    await prisma.rfq.update({ where: { id: rfqId }, data: { status: "OPEN" } });
    await prisma.rfqEvent.create({ data: { rfqId, type: "OPENED", actorEmail: actor.email } });
  }

  return results;
}

// ---------------------------------------------------------------- bids

export type BidLineInput = { quantity: number; unitPrice: number; notes?: string };

export type BidTermsInput = {
  quotationDate?: Date | null;
  validUntil?: Date | null;
  leadTimeDays?: number | null;
  weeklyCapacity?: number | null;
  moq?: number | null;
  paymentTerms?: string;
  incoterm?: string;
  notes?: string;
};

/**
 * Creates or replaces a vendor's bid. Lines are replaced wholesale rather than
 * diffed, because a quotation is a single commercial statement and a partial
 * update would leave a meaningless mixture of two offers.
 */
export async function submitBid(
  actor: Actor,
  rfqId: string,
  lines: BidLineInput[],
  terms: BidTermsInput,
  asDraft: boolean,
) {
  if (actor.role !== "VENDOR" || !actor.vendorId) throw new Error("Only vendor users can quote");

  const invitation = await prisma.rfqInvitation.findUnique({
    where: { rfqId_vendorId: { rfqId, vendorId: actor.vendorId } },
  });
  if (!invitation) throw new Error("You have not been invited to this RFQ");

  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } });
  if (rfq.status !== "OPEN") throw new Error("This RFQ is no longer accepting quotations");
  if (!asDraft && rfq.closesAt < new Date()) throw new Error("The closing date has passed");
  if (lines.length === 0) throw new Error("Quote a price against at least one quantity");

  const metrics = computeMetrics(
    {
      leadTimeDays: terms.leadTimeDays ?? null,
      weeklyCapacity: (terms.weeklyCapacity ?? null) as never,
      moq: (terms.moq ?? null) as never,
      paymentTerms: terms.paymentTerms ?? null,
    },
    lines.map((l) => ({ quantity: l.quantity as never, unitPrice: l.unitPrice as never })),
    rfq,
  );

  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const weightedAvgPrice =
    totalQuantity > 0 ? lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) / totalQuantity : 0;

  const data = {
    status: asDraft ? ("DRAFT" as const) : ("SUBMITTED" as const),
    currency: rfq.currency,
    notes: terms.notes,
    quotationDate: terms.quotationDate ?? new Date(),
    validUntil: terms.validUntil ?? null,
    leadTimeDays: terms.leadTimeDays ?? null,
    weeklyCapacity: terms.weeklyCapacity ?? null,
    moq: terms.moq ?? null,
    paymentTerms: terms.paymentTerms,
    incoterm: terms.incoterm,
    submittedById: actor.id,
    submittedAt: asDraft ? null : new Date(),
    totalQuantity,
    weightedAvgPrice,
    referencePrice: metrics.referencePrice,
  };

  const bid = await prisma.bid.upsert({
    where: { rfqId_vendorId: { rfqId, vendorId: actor.vendorId } },
    create: { rfqId, vendorId: actor.vendorId, ...data },
    update: data,
  });

  await prisma.$transaction([
    prisma.bidLine.deleteMany({ where: { bidId: bid.id } }),
    prisma.bidLine.createMany({
      data: lines
        .slice()
        .sort((a, b) => a.quantity - b.quantity)
        .map((l, i) => ({ bidId: bid.id, lineNo: i + 1, quantity: l.quantity, unitPrice: l.unitPrice, notes: l.notes })),
    }),
  ]);

  if (!asDraft) {
    await prisma.rfqInvitation.update({
      where: { rfqId_vendorId: { rfqId, vendorId: actor.vendorId } },
      data: { status: "SUBMITTED", respondedAt: new Date() },
    });
    await prisma.rfqEvent.create({
      data: { rfqId, type: "BID_SUBMITTED", actorEmail: actor.email, detail: `${lines.length} price breaks` },
    });
    // Fires only when this was the last outstanding vendor.
    await notifyAllBidsIn(rfqId);
  }

  return bid;
}

export async function declineInvitation(actor: Actor, rfqId: string, note?: string) {
  if (actor.role !== "VENDOR" || !actor.vendorId) throw new Error("Not permitted");
  await prisma.rfqInvitation.update({
    where: { rfqId_vendorId: { rfqId, vendorId: actor.vendorId } },
    data: { status: "DECLINED", respondedAt: new Date(), declineNote: note },
  });
  await prisma.rfqEvent.create({
    data: { rfqId, type: "VENDOR_DECLINED", actorEmail: actor.email, detail: note },
  });
  await notifyAllBidsIn(rfqId);
}

export async function markInvitationViewed(rfqId: string, vendorId: string) {
  await prisma.rfqInvitation.updateMany({
    where: { rfqId, vendorId, status: "INVITED" },
    data: { status: "VIEWED", viewedAt: new Date() },
  });
}

// ---------------------------------------------------------------- comparison

/** Win and participation counts per vendor, excluding the RFQ being scored. */
export async function vendorHistories(excludeRfqId: string): Promise<Map<string, VendorHistory>> {
  const bids = await prisma.bid.findMany({
    where: { status: "SUBMITTED", rfqId: { not: excludeRfqId }, rfq: { status: "AWARDED" } },
    select: { vendorId: true, id: true, rfq: { select: { awardedBidId: true } } },
  });

  const map = new Map<string, VendorHistory>();
  for (const b of bids) {
    const entry = map.get(b.vendorId) ?? { participated: 0, won: 0 };
    entry.participated += 1;
    if (b.rfq.awardedBidId === b.id) entry.won += 1;
    map.set(b.vendorId, entry);
  }
  return map;
}

export async function compareRfq(rfqId: string) {
  const rfq = await prisma.rfq.findUniqueOrThrow({
    where: { id: rfqId },
    include: { localItem: true },
  });

  const bids = (await prisma.bid.findMany({
    where: { rfqId, status: "SUBMITTED" },
    include: { lines: { orderBy: { quantity: "asc" } }, vendor: { select: { id: true, name: true, code: true } } },
  })) as BidWithLines[];

  const history = await vendorHistories(rfqId);
  return { rfq, bids, scores: scoreBids(rfq, bids, history) };
}

export async function awardRfq(actor: Actor, rfqId: string, bidId: string, reason?: string) {
  if (!isInternal(actor.role)) throw new Error("Not permitted");

  const bid = await prisma.bid.findUniqueOrThrow({ where: { id: bidId }, include: { vendor: true } });
  if (bid.rfqId !== rfqId) throw new Error("That bid belongs to a different RFQ");
  if (bid.status !== "SUBMITTED") throw new Error("Only a submitted bid can be awarded");

  await prisma.rfq.update({
    where: { id: rfqId },
    data: {
      status: "AWARDED",
      awardedBidId: bidId,
      awardedAt: new Date(),
      awardedBy: actor.email,
      awardReason: reason,
      closedAt: new Date(),
      events: {
        create: {
          type: "AWARDED",
          actorEmail: actor.email,
          detail: `${bid.vendor.name}${reason ? `: ${reason}` : ""}`,
        },
      },
    },
  });

  return bid;
}

export async function closeRfq(actor: Actor, rfqId: string) {
  if (!isInternal(actor.role)) throw new Error("Not permitted");
  await prisma.rfq.update({
    where: { id: rfqId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      events: { create: { type: "CLOSED", actorEmail: actor.email } },
    },
  });
}

// ---------------------------------------------------------------- scoping

/** Vendors see only the RFQs they were invited to. */
export function rfqScope(actor: Actor): Prisma.RfqWhereInput {
  if (isInternal(actor.role)) return {};
  if (!actor.vendorId) return { id: "__no_access__" };
  return {
    // A draft has not been issued to anyone yet.
    status: { in: ["OPEN", "CLOSED", "AWARDED"] },
    invitations: { some: { vendorId: actor.vendorId } },
  };
}

export async function listRfqs(actor: Actor, filters: { status?: string; q?: string }) {
  const where: Prisma.RfqWhereInput = { ...rfqScope(actor) };
  if (filters.status) where.status = filters.status as never;
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { itemNumber: { contains: q, mode: "insensitive" } },
    ];
  }

  return prisma.rfq.findMany({
    where,
    include: {
      localItem: { select: { localCode: true, name: true, erpItemNumber: true } },
      _count: { select: { invitations: true, bids: true } },
      bids: { where: { status: "SUBMITTED" }, select: { id: true, vendorId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getRfq(actor: Actor, id: string) {
  const rfq = await prisma.rfq.findFirst({
    where: { id, ...rfqScope(actor) },
    include: {
      localItem: true,
      createdBy: { select: { email: true, name: true } },
      invitations: { include: { vendor: { select: { id: true, name: true, code: true } } } },
      watchers: { include: { user: { select: { email: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
      // The brief is shown to both sides, so it is loaded here rather than
      // fetched separately by the page.
      attachments: {
        select: { id: true, filename: true, sizeBytes: true, uploadedBy: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return rfq;
}



// ---------------------------------------------------------------- provisional vendors

/**
 * Adds a supplier who is not in D365 yet, so they can be invited to quote.
 *
 * Rather than bolt on a token-based guest link, this creates a real but
 * provisional vendor plus an allow-listed email. They then sign in with the
 * normal magic link and are scoped exactly like any other supplier, so there
 * is no second, weaker access path to maintain. When the vendor is eventually
 * created in D365, an administrator points the record at the real account.
 */
export async function addProvisionalVendor(
  actor: Actor,
  input: { name: string; contactName?: string; email: string },
) {
  if (!isInternal(actor.role)) throw new Error("Not permitted");

  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter a valid email address");
  if (!input.name.trim()) throw new Error("Enter the company name");

  const clash = await prisma.allowedEmail.findUnique({
    where: { email },
    include: { vendor: { select: { name: true } } },
  });
  if (clash) throw new Error(`${email} is already registered against ${clash.vendor.name}`);

  const domain = email.split("@")[1];
  const domainOwner = await prisma.vendor.findFirst({
    where: { domains: { has: domain } },
    select: { name: true },
  });

  const code = await nextProvisionalCode();

  const vendor = await prisma.vendor.create({
    data: {
      code,
      name: input.name.trim(),
      contactName: input.contactName?.trim(),
      isProvisional: true,
      source: "MANUAL",
      isActive: true,
      // Deliberately no domain mapping: only the named address gets in, since
      // a provisional record has had no vetting behind it.
      allowedEmails: { create: { email, note: `Added by ${actor.email} for an RFQ` } },
    },
  });

  // An allow-listed address is only permission to hold an account. With
  // passwords they also need the account itself, or the invitation arrives and
  // there is nothing to sign in to.
  const { createUserAccount, sendSetupLink } = await import("@/lib/accounts");
  let setupSent = false;
  try {
    const user = await createUserAccount(actor.email, { email, name: input.contactName });
    const result = await sendSetupLink(user.id, actor.email);
    setupSent = !!result.sent;
  } catch {
    // Not fatal. An administrator can send the link from the Users page.
  }

  return {
    vendor,
    setupSent,
    warning: domainOwner
      ? `Note that ${domain} is already mapped to ${domainOwner.name}. Check this is a different company before inviting them.`
      : null,
  };
}

async function nextProvisionalCode(): Promise<string> {
  const last = await prisma.vendor.findFirst({
    where: { code: { startsWith: "PROV-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const n = last ? Number(last.code.slice(5)) + 1 : 1;
  return `PROV-${String(n).padStart(5, "0")}`;
}

/** Points a provisional vendor at its real D365 account once it exists. */
export async function linkProvisionalVendor(actor: Actor, vendorId: string, realCode: string) {
  if (!isInternal(actor.role)) throw new Error("Not permitted");

  const code = realCode.trim();
  const real = await prisma.vendor.findUnique({ where: { code } });
  if (!real) throw new Error(`${code} is not in the vendor master. Run a vendor refresh first.`);
  if (real.id === vendorId) throw new Error("That is the same record");

  const provisional = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } });
  if (!provisional.isProvisional) throw new Error("That vendor is not provisional");

  // Move everything across, then retire the placeholder rather than deleting
  // it, so historic RFQ references still resolve.
  await prisma.$transaction([
    prisma.allowedEmail.updateMany({ where: { vendorId }, data: { vendorId: real.id } }),
    prisma.user.updateMany({ where: { vendorId }, data: { vendorId: real.id } }),
    prisma.bid.updateMany({ where: { vendorId }, data: { vendorId: real.id } }),
    prisma.rfqInvitation.updateMany({ where: { vendorId }, data: { vendorId: real.id } }),
    prisma.agreement.updateMany({ where: { vendorId }, data: { vendorId: real.id } }),
    prisma.vendor.update({
      where: { id: vendorId },
      data: { isActive: false, name: `${provisional.name} (merged into ${code})` },
    }),
  ]);

  return real;
}

// ---------------------------------------------------------------- settings

export const RFQ_SETTINGS_ID = "default";
export const DEFAULT_TIERS = [5000, 10000, 25000, 50000, 100000, 200000, 500000];

export async function getRfqSettings() {
  const existing = await prisma.rfqSetting.findUnique({ where: { id: RFQ_SETTINGS_ID } });
  if (existing) return existing;
  return prisma.rfqSetting.create({
    data: { id: RFQ_SETTINGS_ID, standardTiers: DEFAULT_TIERS },
  });
}
