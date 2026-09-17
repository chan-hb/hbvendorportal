"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { sendTestEmailAction, type AuthState } from "@/app/actions/account";

export function MailDiagnostics({
  provider,
  sendingAs,
  replyTo,
}: {
  provider: "graph" | "resend" | "log";
  sendingAs: string | null;
  replyTo: string | null;
}) {
  const [state, formAction] = useActionState<AuthState, FormData>(sendTestEmailAction, null);

  const label = {
    graph: "Microsoft Graph",
    resend: "Resend",
    log: "Not configured",
  }[provider];

  return (
    <div className="space-y-4 p-5">
      {state?.error ? (
        <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="field-label">Provider</dt>
          <dd className="text-sm font-medium">
            {provider === "log" ? (
              <span className="text-[#A32B2B]">{label}</span>
            ) : (
              <span className="text-[#2C6B44]">{label}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="field-label">Sending as</dt>
          <dd className="text-sm font-medium">{sendingAs ?? "Not resolved"}</dd>
        </div>
        <div>
          <dt className="field-label">Replies go to</dt>
          <dd className="text-sm font-medium">{replyTo ?? sendingAs ?? "Not set"}</dd>
        </div>
      </dl>

      {provider === "log" ? (
        <p className="border border-nude/40 bg-[#FBF0E8] px-4 py-3 text-sm text-nude">
          Nothing is being sent. Messages are written to the server log instead, so invitations and password links
          will not reach anyone. Add the Graph credentials in Vercel and redeploy.
        </p>
      ) : null}

      <form action={formAction}>
        <SubmitButton className="btn-ghost">Send a test to myself</SubmitButton>
      </form>

      <p className="text-xs text-charcoal/55">
        The test goes to your own address, so this cannot be used to mail anyone else. Worth running after any
        change to the sender, since a wrong mailbox fails at send time rather than when you save it.
      </p>
    </div>
  );
}
