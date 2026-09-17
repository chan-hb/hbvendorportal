import Link from "next/link";
import { ForgotPasswordForm } from "@/components/AuthForms";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="panel w-full max-w-md p-10">
        <p className="eyebrow">Password</p>
        <h1 className="mt-2 font-display text-2xl uppercase tracking-tight">Forgotten your password?</h1>
        <p className="mt-3 text-sm text-charcoal/70">
          Enter the address you sign in with and we will send you a link to choose a new one.
        </p>

        <div className="mt-6">
          <ForgotPasswordForm />
        </div>

        <Link
          href="/login"
          className="mt-6 block text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal/50 hover:text-pink"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
