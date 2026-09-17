import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { canAdminister, canApprove } from "@/lib/rbac";
import { DEFAULT_TIERS, getRfqSettings } from "@/lib/rfq/service";
import { dateTime } from "@/lib/format";
import { Panel } from "@/components/Panel";
import { RfqSettingsForm } from "@/components/RfqSettingsForm";
import { ProvisionalVendorForm } from "@/components/ProvisionalVendorForm";
import { SenderPicker } from "@/components/SenderPicker";
import { MailDiagnostics } from "@/components/MailDiagnostics";
import { addressOf, mailProvider } from "@/lib/mail";
import { systemSender } from "@/lib/accounts";
import { prisma } from "@/lib/prisma";

export default async function RfqSettingsPage() {
  const user = await requireUser();
  // Purchasing owns this, so approvers get in as well as administrators.
  if (!canApprove(user.role) && !canAdminister(user.role)) redirect("/rfq");

  const [settings, staff, sender] = await Promise.all([
    getRfqSettings(),
    prisma.user.findMany({
      where: { role: { in: ["HB_USER", "HB_APPROVER", "HB_ADMIN"] }, isActive: true },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
    }),
    systemSender(),
  ]);
  const tiers = settings.standardTiers.length ? settings.standardTiers.map((t) => Number(t)) : DEFAULT_TIERS;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Purchasing</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">RFQ settings</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Sender address, standard quantity breaks and default terms.
          {settings.updatedBy ? ` Last changed by ${settings.updatedBy} on ${dateTime(settings.updatedAt)}.` : ""}
        </p>
      </div>

      <Panel title="Email" subtitle="Check this works before inviting anyone">
        <MailDiagnostics
          provider={mailProvider()}
          sendingAs={addressOf(sender.from)}
          replyTo={addressOf(sender.replyTo)}
        />
      </Panel>

      <Panel
        title="Who mail comes from"
        subtitle="Invitations, password links and outcome notices all go out under this person"
      >
        <SenderPicker
          staff={staff}
          selectedId={settings.senderUserId}
          fallback={settings.fromEmail ?? process.env.EMAIL_FROM ?? ""}
        />
      </Panel>

      <Panel title="Email and defaults">
        <RfqSettingsForm
          fallbackFrom={process.env.EMAIL_FROM ?? ""}
          values={{
            fromName: settings.fromName,
            fromEmail: settings.fromEmail ?? "",
            replyTo: settings.replyTo ?? "",
            ccEmails: settings.ccEmails.join(", "),
            standardTiers: tiers.join(", "),
            defaultPaymentTerms: settings.defaultPaymentTerms ?? "",
            defaultIncoterm: settings.defaultIncoterm ?? "",
          }}
        />
      </Panel>

      <Panel
        title="Add a supplier who is not in Dynamics 365"
        subtitle="They can be invited to quote straight away, and merged with the real account later"
      >
        <ProvisionalVendorForm />
      </Panel>
    </div>
  );
}
