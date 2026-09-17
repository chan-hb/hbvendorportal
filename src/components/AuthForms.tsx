"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import {
  changePasswordAction,
  requestResetAction,
  setPasswordAction,
  signInAction,
  type AuthState,
} from "@/app/actions/account";

function Alert({ state }: { state: AuthState }) {
  if (state?.error) {
    return <p className="border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">{state.error}</p>;
  }
  if (state?.ok) {
    return <p className="border border-[#2C6B44]/25 bg-[#EAF4EE] px-4 py-3 text-sm text-[#2C6B44]">{state.ok}</p>;
  }
  return null;
}

/** Length is what matters, so the meter rewards it rather than punctuation. */
function strengthOf(value: string): { label: string; pct: number; tone: string } {
  const length = value.length;
  if (length === 0) return { label: "", pct: 0, tone: "bg-line" };
  if (length < 12) return { label: "Too short", pct: 25, tone: "bg-[#A32B2B]" };
  if (length < 16) return { label: "Acceptable", pct: 55, tone: "bg-nude" };
  if (length < 24) return { label: "Good", pct: 80, tone: "bg-pink" };
  return { label: "Strong", pct: 100, tone: "bg-[#2C6B44]" };
}

function PasswordFields({
  nameNew = "password",
  nameConfirm = "confirm",
  label = "New password",
}: {
  nameNew?: string;
  nameConfirm?: string;
  label?: string;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const strength = strengthOf(value);

  return (
    <>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="field-label" htmlFor={nameNew}>{label}</label>
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-charcoal/50 hover:text-pink"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id={nameNew}
          name={nameNew}
          type={show ? "text" : "password"}
          className="input"
          required
          minLength={12}
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="mt-2 h-1 w-full bg-line">
          <div className={`h-full transition-all ${strength.tone}`} style={{ width: `${strength.pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-charcoal/55">
          {strength.label ? `${strength.label}. ` : ""}
          At least 12 characters. A short phrase you will remember beats a short jumble you will not.
        </p>
      </div>

      <div>
        <label className="field-label" htmlFor={nameConfirm}>Confirm password</label>
        <input
          id={nameConfirm}
          name={nameConfirm}
          type={show ? "text" : "password"}
          className="input"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </div>
    </>
  );
}

export function SignInForm({ entraEnabled }: { entraEnabled: boolean }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signInAction, null);

  return (
    <div className="space-y-6">
      <Alert state={state} />

      <form action={formAction} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" required autoComplete="username" className="input" />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <SubmitButton className="btn-primary w-full">Sign in</SubmitButton>
      </form>

      <div className="flex justify-between text-xs">
        <Link href="/forgot-password" className="font-bold uppercase tracking-[0.12em] text-pink hover:underline">
          Forgot your password?
        </Link>
      </div>

      {entraEnabled ? (
        <>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-charcoal/40">
            <span className="h-px flex-1 bg-line" />
            Huda Beauty staff
            <span className="h-px flex-1 bg-line" />
          </div>
          <form action="/api/auth/signin/microsoft-entra-id" method="post">
            <button type="submit" className="btn-ghost w-full">Continue with Microsoft</button>
          </form>
        </>
      ) : null}
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(requestResetAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Alert state={state} />
      <div>
        <label className="field-label" htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="input" />
      </div>
      <SubmitButton className="btn-primary w-full">Send a reset link</SubmitButton>
      <p className="text-xs text-charcoal/55">
        The link is valid for two hours and works once. Your current password keeps working until you set a new one.
      </p>
    </form>
  );
}

export function SetPasswordForm({ token, purpose }: { token: string; purpose: "SET_INITIAL" | "RESET" }) {
  const [state, formAction] = useActionState<AuthState, FormData>(setPasswordAction, null);

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert state={state} />
        <Link href="/login" className="btn-primary w-full">Go to sign in</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Alert state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordFields label={purpose === "SET_INITIAL" ? "Choose a password" : "New password"} />
      <SubmitButton className="btn-primary w-full">
        {purpose === "SET_INITIAL" ? "Set password and continue" : "Change password"}
      </SubmitButton>
    </form>
  );
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction] = useActionState<AuthState, FormData>(changePasswordAction, null);

  if (state?.ok && forced) {
    return (
      <div className="space-y-4">
        <Alert state={state} />
        <Link href="/" className="btn-primary w-full">Continue to the portal</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <Alert state={state} />

      {!forced ? (
        <div>
          <label className="field-label" htmlFor="current">Current password</label>
          <input id="current" name="current" type="password" required autoComplete="current-password" className="input" />
        </div>
      ) : (
        <input type="hidden" name="current" value="" />
      )}

      <PasswordFields nameNew="next" label="New password" />
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}
