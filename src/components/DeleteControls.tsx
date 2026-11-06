"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  deleteAgreementAction,
  deleteLocalItemAction,
  deleteRfqAction,
  deleteUserAction,
} from "@/app/actions/rfq";
import type { ActionState } from "@/app/actions/agreements";

/**
 * Deletion is irreversible, so each control asks for the reference to be typed
 * back rather than offering a one-click confirm. The friction is the point:
 * these are used rarely, and the cost of a mistake is higher than the cost of
 * a few seconds.
 *
 * What the server refuses matters more than this does. An agreement already in
 * D365, or an RFQ whose award has been emailed to suppliers, cannot be deleted
 * at all, because the portal would then disagree with reality.
 */
function Confirm({
  action,
  hiddenFields,
  expected,
  label,
  blockedReason,
  description,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields: Record<string, string>;
  expected: string;
  label: string;
  blockedReason?: string | null;
  description: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  if (blockedReason) {
    return <p className="alert-note">{blockedReason}</p>;
  }

  if (!open) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-charcoal/70">{description}</p>
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost">
          {label}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {state?.error ? <p className="alert-error">{state.error}</p> : null}
      {state?.ok ? <p className="alert-ok">{state.ok}</p> : null}

      <p className="text-sm text-charcoal/70">
        This cannot be undone. Type <span className="font-semibold text-charcoal">{expected}</span> to confirm.
      </p>

      <input
        name="confirm"
        className="input max-w-sm"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={expected}
        autoComplete="off"
      />

      <div className="flex flex-wrap gap-3">
        <SubmitButton className="btn-dark">Delete permanently</SubmitButton>
        <button type="button" onClick={() => { setOpen(false); setTyped(""); }} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DeleteRfq({ rfqId, reference, blocked }: { rfqId: string; reference: string; blocked: boolean }) {
  return (
    <div className="p-5">
      <Confirm
        action={deleteRfqAction}
        hiddenFields={{ rfqId, reference }}
        expected={reference}
        label="Delete this RFQ"
        description="Removes the RFQ, its invitations, every quotation submitted against it and the activity log. Suppliers are not told."
        blockedReason={
          blocked
            ? "This RFQ has been awarded and every bidder has been emailed the outcome, so it cannot be deleted. Deleting it would remove the record of a decision suppliers already know about."
            : null
        }
      />
    </div>
  );
}

export function DeleteAgreement({
  agreementId,
  reference,
  erpCreated,
  erpRecordId,
}: {
  agreementId: string;
  reference: string;
  erpCreated: boolean;
  erpRecordId?: string | null;
}) {
  return (
    <div className="p-5">
      <Confirm
        action={deleteAgreementAction}
        hiddenFields={{ agreementId, reference }}
        expected={reference}
        label="Delete this agreement"
        description="Removes the request and its approval history."
        blockedReason={
          erpCreated
            ? `This has been created in Dynamics 365${
                erpRecordId ? ` as ${erpRecordId}` : ""
              }. Deleting it here would not remove the price from the ERP, and the two would then disagree.`
            : null
        }
      />
    </div>
  );
}

export function DeleteLocalItem({
  localItemId,
  localCode,
  rfqCount,
}: {
  localItemId: string;
  localCode: string;
  rfqCount: number;
}) {
  return (
    <Confirm
      action={deleteLocalItemAction}
      hiddenFields={{ localItemId, localCode }}
      expected={localCode}
      label="Delete"
      description=""
      blockedReason={
        rfqCount > 0
          ? `Used by ${rfqCount} RFQ${rfqCount === 1 ? "" : "s"}, so it cannot be deleted yet.`
          : null
      }
    />
  );
}

export function DeleteUser({
  userId,
  email,
  recordCount,
}: {
  userId: string;
  email: string;
  recordCount: number;
}) {
  return (
    <Confirm
      action={deleteUserAction}
      hiddenFields={{ userId, email }}
      expected={email}
      label="Delete"
      description=""
      blockedReason={
        recordCount > 0
          ? `Appears on ${recordCount} record${
              recordCount === 1 ? "" : "s"
            }. Deactivate instead: that blocks sign-in and keeps the history intact.`
          : null
      }
    />
  );
}
