"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { setSenderAction } from "@/app/actions/account";
import type { ActionState } from "@/app/actions/agreements";

/**
 * Mail goes out under a named Huda Beauty person rather than a no-reply
 * address, so a supplier who replies reaches someone rather than a void.
 */
export function SenderPicker({
  staff,
  selectedId,
  fallback,
}: {
  staff: { id: string; email: string; name: string | null }[];
  selectedId: string | null;
  fallback: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(setSenderAction, null);

  return (
    <form action={formAction} className="space-y-4 p-5">
      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
      ) : null}

      <div className="max-w-md">
        <label className="field-label" htmlFor="senderUserId">Send as</label>
        <select id="senderUserId" name="senderUserId" defaultValue={selectedId ?? ""} className="input">
          <option value="">
            {fallback ? `Use the configured address (${fallback})` : "No sender chosen"}
          </option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name ? `${s.name} . ${s.email}` : s.email}
            </option>
          ))}
        </select>
      </div>

      <SubmitButton>Save sender</SubmitButton>

      <p className="text-xs text-charcoal/55">
        The address must be on a domain verified with your mail provider. A Huda Beauty address works once
        hudabeauty.com is verified; a personal or external address will be rejected at send time, not here. If no
        sender is chosen, the first administrator account is used so that mail is always attributable.
      </p>
    </form>
  );
}
