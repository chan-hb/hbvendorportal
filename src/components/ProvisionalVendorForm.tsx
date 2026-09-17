"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { addProvisionalVendorAction } from "@/app/actions/rfq";
import type { ActionState } from "@/app/actions/agreements";

/**
 * Adds a supplier who is not in D365 yet. They become a real but provisional
 * vendor with one allow-listed address, so they sign in and are scoped exactly
 * like everyone else rather than through a weaker guest route.
 */
export function ProvisionalVendorForm({ rfqId }: { rfqId?: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(addProvisionalVendorAction, null);

  return (
    <form action={formAction} className="space-y-4 p-5">
      {rfqId ? <input type="hidden" name="rfqId" value={rfqId} /> : null}

      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="name">Company name</label>
          <input id="name" name="name" className="input" required placeholder="Acme Packaging Ltd" />
        </div>
        <div>
          <label className="field-label" htmlFor="contactName">Contact name</label>
          <input id="contactName" name="contactName" className="input" placeholder="Jane Doe" />
        </div>
        <div>
          <label className="field-label" htmlFor="email">Contact email</label>
          <input id="email" name="email" type="email" className="input" required />
        </div>
      </div>

      <SubmitButton>{rfqId ? "Add and invite to this RFQ" : "Add supplier"}</SubmitButton>

      <p className="text-xs text-charcoal/55">
        They get a provisional account and can quote immediately. Only the address you enter can sign in, since
        nothing has been vetted. Once the vendor exists in Dynamics 365, merge the record from the Vendors page so
        their history follows them.
      </p>
    </form>
  );
}
