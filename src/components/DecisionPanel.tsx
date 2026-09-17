"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { decisionAction, type ActionState } from "@/app/actions/agreements";

export function DecisionPanel({ agreementId }: { agreementId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(decisionAction, null);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | "REQUEST_CHANGE">("APPROVE");

  return (
    <form action={formAction} className="space-y-4 p-5">
      <input type="hidden" name="agreementId" value={agreementId} />
      <input type="hidden" name="decision" value={decision} />

      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
      ) : null}

      <fieldset>
        <legend className="field-label">Decision</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["APPROVE", "Approve"],
              ["REQUEST_CHANGE", "Request change"],
              ["REJECT", "Reject"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer border px-3 py-2 text-center text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                decision === value ? "border-pink bg-pink text-white" : "border-line bg-white text-charcoal/70"
              }`}
            >
              <input
                type="radio"
                name="decisionChoice"
                value={value}
                className="sr-only"
                checked={decision === value}
                onChange={() => setDecision(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="field-label" htmlFor="comment">
          Comment {decision === "APPROVE" ? "(optional)" : "(required)"}
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={3}
          className="input"
          placeholder={
            decision === "REQUEST_CHANGE"
              ? "Tell the vendor exactly what needs to change"
              : "Add context for the audit trail"
          }
        />
      </div>

      <SubmitButton className={decision === "APPROVE" ? "btn-primary" : "btn-dark"}>Record decision</SubmitButton>
    </form>
  );
}
