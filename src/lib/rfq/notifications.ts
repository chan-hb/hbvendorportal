import { prisma } from "@/lib/prisma";
import { appUrl, layout, sendMail, type MailAttachment } from "@/lib/mail";
import { shortDate } from "@/lib/format";
import { getRfqSettings } from "./service";

/**
 * Sender and copy list are Purchasing's decision, not an environment variable.
 * Falls through to the chosen Huda Beauty user, then to the first
 * administrator, so mail always comes from a person a supplier can reply to.
 */
async function sender() {
  const s = await getRfqSettings();
  const { systemSender } = await import("@/lib/accounts");
  const resolved = await systemSender();
  return {
    from: s.fromEmail ? `${s.fromName} <${s.fromEmail}>` : resolved.from,
    replyTo: s.replyTo ?? resolved.replyTo,
    cc: s.ccEmails,
  };
}

/**
 * Every notification records an RfqEvent, including failures, so a buyer can
 * see whether a supplier was actually told rather than assuming it.
 */

async function record(rfqId: string, type: Parameters<typeof prisma.rfqEvent.create>[0]["data"]["type"], detail: string, actorEmail?: string) {
  await prisma.rfqEvent.create({ data: { rfqId, type, detail: detail.slice(0, 500), actorEmail } }).catch(() => {});
}

/** Everyone at a vendor who can sign in: portal users plus allow-listed contacts. */
export async function vendorRecipients(vendorId: string): Promise<string[]> {
  const [users, allowed] = await Promise.all([
    prisma.user.findMany({ where: { vendorId, isActive: true }, select: { email: true } }),
    prisma.allowedEmail.findMany({ where: { vendorId }, select: { email: true } }),
  ]);
  return Array.from(new Set([...users.map((u) => u.email), ...allowed.map((a) => a.email)]));
}

export async function notifyVendorInvited(rfqId: string, vendorId: string, actorEmail?: string) {
  const [rfq, vendor] = await Promise.all([
    prisma.rfq.findUniqueOrThrow({ where: { id: rfqId }, include: { localItem: true } }),
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } }),
  ]);

  const to = await vendorRecipients(vendorId);
  if (to.length === 0) {
    await record(rfqId, "NOTIFICATION_FAILED", `${vendor.name} has no contact with portal access`, actorEmail);
    return { sent: false, error: "No contacts with portal access" };
  }

  // The brief travels with the invitation, because a supplier should not have
  // to sign in just to find out whether the job is worth quoting for.
  const attachments = await prisma.rfqAttachment.findMany({
    where: { rfqId },
    select: { filename: true, data: true, sizeBytes: true, contentType: true },
  });
  // The provider decides what it can carry; oversized files are named in the
  // message so the supplier knows to fetch them from the portal.
  const files: MailAttachment[] = attachments.map((a) => ({
    filename: a.filename,
    content: Buffer.from(a.data),
    contentType: a.contentType,
  }));

  const tiers = rfq.quantityTiers.map((t) => Number(t).toLocaleString()).join(", ");

  const item = rfq.itemNumber ?? rfq.localItem?.name ?? "See the portal";
  const body = layout({
    heading: "You are invited to quote",
    intro: `Huda Beauty has invited ${vendor.name} to submit a quotation for ${rfq.title}. Please price each quantity break, and tell us your lead time, weekly capacity, minimum order quantity and payment terms.`,
    rows: [
      ["Reference", rfq.reference],
      ["Item", item],
      ["Quantity sought", `${Number(rfq.targetQuantity).toLocaleString()} ${rfq.unit ?? ""}`.trim()],
      ["Price breaks wanted", tiers || "As you see fit"],
      ["Currency", rfq.currency],
      ["Payment terms sought", rfq.requestedPaymentTerms ?? "Tell us what you offer"],
      ["Quotations close", shortDate(rfq.closesAt)],
      ...(files.length ? ([["Attached", files.map((f) => f.filename).join(", ")]] as [string, string][]) : []),
    ],
    ctaLabel: "Submit your quotation",
    ctaUrl: appUrl(`/rfq/${rfq.id}`),
    outro: "Sign in with your usual work email. If the link does not open, request a sign-in link from the portal home page.",
  });

  const result = await sendMail({
    to,
    subject: `${rfq.reference} . Invitation to quote . ${rfq.title}`,
    ...body,
    ...(await sender()),
    attachments: files,
  });

  await prisma.rfqInvitation.update({
    where: { rfqId_vendorId: { rfqId, vendorId } },
    data: { emailSentAt: result.sent ? new Date() : null, emailTo: to },
  }).catch(() => {});

  await record(
    rfqId,
    result.sent ? "INVITE_EMAIL_SENT" : "NOTIFICATION_FAILED",
    result.sent
      ? `Invitation emailed to ${to.join(", ")}` +
        (result.omittedAttachments?.length
          ? `. Too large to attach: ${result.omittedAttachments.join(", ")}`
          : "")
      : `${vendor.name}: ${result.error ?? result.skipped}`,
    actorEmail,
  );

  return result;
}

/**
 * Fires once, when the last outstanding invitation has been answered. Goes to
 * the RFQ creator and anyone added as a watcher.
 */
export async function notifyAllBidsIn(rfqId: string) {
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    include: {
      createdBy: { select: { email: true } },
      watchers: { include: { user: { select: { email: true, isActive: true } } } },
      invitations: true,
      bids: { where: { status: "SUBMITTED" }, include: { vendor: { select: { name: true } } } },
    },
  });
  if (!rfq || rfq.allBidsInAlertSentAt) return { sent: false, skipped: "Already sent" };

  const outstanding = rfq.invitations.filter(
    (i) => i.status !== "SUBMITTED" && i.status !== "DECLINED",
  );
  if (outstanding.length > 0) return { sent: false, skipped: "Still waiting on vendors" };

  const to = Array.from(
    new Set([
      rfq.createdBy.email,
      ...rfq.watchers.filter((w) => w.user.isActive).map((w) => w.user.email),
    ]),
  );

  const body = layout({
    heading: "All quotations are in",
    intro: `Every vendor invited to ${rfq.reference} has responded. The comparison and the suggested award are ready to review.`,
    rows: [
      ["Reference", rfq.reference],
      ["Title", rfq.title],
      ["Bids received", String(rfq.bids.length)],
      ["Vendors", rfq.bids.map((b) => b.vendor.name).join(", ") || "None"],
      ["Declined", String(rfq.invitations.filter((i) => i.status === "DECLINED").length)],
    ],
    ctaLabel: "Compare the bids",
    ctaUrl: appUrl(`/rfq/${rfq.id}`),
    outro: "The suggested bid is a weighted score, not a decision. The breakdown behind it is on the comparison tab.",
  });

  const result = await sendMail({
    to,
    subject: `${rfq.reference} . All quotations received`,
    ...body,
    ...(await sender()),
  });

  if (result.sent || result.skipped) {
    await prisma.rfq.update({ where: { id: rfqId }, data: { allBidsInAlertSentAt: new Date() } });
  }
  await record(
    rfqId,
    result.sent ? "ALL_BIDS_IN" : "NOTIFICATION_FAILED",
    result.sent ? `Notified ${to.join(", ")}` : `${result.error ?? result.skipped}`,
  );

  return result;
}

export async function notifyAwardOutcome(rfqId: string, actorEmail?: string) {
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    include: { bids: { where: { status: "SUBMITTED" }, include: { vendor: true } } },
  });
  if (!rfq?.awardedBidId) return;

  for (const bid of rfq.bids) {
    const won = bid.id === rfq.awardedBidId;
    const to = await vendorRecipients(bid.vendorId);
    if (to.length === 0) continue;

    const body = layout({
      heading: won ? "Your quotation was accepted" : "Quotation outcome",
      intro: won
        ? `Huda Beauty has accepted ${bid.vendor.name}'s quotation for ${rfq.title}. A buyer will be in touch about next steps.`
        : `Thank you for quoting on ${rfq.title}. On this occasion the business has been placed elsewhere. We would like you to quote again next time.`,
      rows: [["Reference", rfq.reference], ["Title", rfq.title]],
      ctaLabel: "View in the portal",
      ctaUrl: appUrl(`/rfq/${rfq.id}`),
    });

    await sendMail({
      to,
      subject: `${rfq.reference} . ${won ? "Quotation accepted" : "Quotation outcome"}`,
      ...body,
      ...(await sender()),
    });
  }

  await record(rfqId, "AWARDED", "Outcome emails sent to all bidders", actorEmail);
}
