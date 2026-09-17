"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { saveRfqSettingsAction } from "@/app/actions/rfq";
import type { ActionState } from "@/app/actions/agreements";

export function RfqSettingsForm({
  values,
  fallbackFrom,
}: {
  values: {
    fromName: string;
    fromEmail: string;
    replyTo: string;
    ccEmails: string;
    standardTiers: string;
    defaultPaymentTerms: string;
    defaultIncoterm: string;
  };
  fallbackFrom: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveRfqSettingsAction, null);

  return (
    <form action={formAction} className="space-y-6 p-5">
      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
      ) : null}

      <div>
        <p className="eyebrow">Who RFQ email comes from</p>
        <p className="mt-1 text-xs text-charcoal/55">
          Applies to invitations, the all-quotations-in alert and award outcomes. The address must be on a domain
          verified with your mail provider, or sending is rejected. Leave the address blank to fall back to{" "}
          {fallbackFrom || "the system default"}.
        </p>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="fromName">Sender name</label>
            <input id="fromName" name="fromName" className="input" defaultValue={values.fromName} placeholder="Huda Beauty Sourcing" />
          </div>
          <div>
            <label className="field-label" htmlFor="fromEmail">Sender address</label>
            <input id="fromEmail" name="fromEmail" type="email" className="input" defaultValue={values.fromEmail} placeholder="sourcing@hudabeauty.com" />
          </div>
          <div>
            <label className="field-label" htmlFor="replyTo">Reply-to address</label>
            <input id="replyTo" name="replyTo" type="email" className="input" defaultValue={values.replyTo} />
            <p className="mt-1 text-xs text-charcoal/55">Where a supplier's reply lands. Often a shared buying mailbox.</p>
          </div>
          <div>
            <label className="field-label" htmlFor="ccEmails">Always copy</label>
            <input id="ccEmails" name="ccEmails" className="input" defaultValue={values.ccEmails} placeholder="buying@hudabeauty.com" />
            <p className="mt-1 text-xs text-charcoal/55">
              Comma separated. Copied on every RFQ email, including those to suppliers.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <p className="eyebrow">Defaults when raising an RFQ</p>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          <div className="md:col-span-3">
            <label className="field-label" htmlFor="standardTiers">Standard quantity breaks</label>
            <input id="standardTiers" name="standardTiers" className="input" defaultValue={values.standardTiers} />
            <p className="mt-1 text-xs text-charcoal/55">
              Comma separated. Offered as tick boxes when raising an RFQ, where a buyer can still add a one-off.
            </p>
          </div>
          <div>
            <label className="field-label" htmlFor="defaultPaymentTerms">Payment terms</label>
            <input id="defaultPaymentTerms" name="defaultPaymentTerms" className="input" defaultValue={values.defaultPaymentTerms} placeholder="60 days from invoice" />
          </div>
          <div>
            <label className="field-label" htmlFor="defaultIncoterm">Incoterm</label>
            <input id="defaultIncoterm" name="defaultIncoterm" className="input" defaultValue={values.defaultIncoterm} placeholder="DDP" />
          </div>
        </div>
      </div>

      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
