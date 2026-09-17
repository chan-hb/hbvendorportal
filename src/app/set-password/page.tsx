import Link from "next/link";
import { consumeToken } from "@/lib/accounts";
import { SetPasswordForm } from "@/components/AuthForms";

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const check = token ? await consumeToken(token) : { valid: false as const, reason: "No link was provided" };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="panel w-full max-w-md p-10">
        <p className="eyebrow">Password</p>

        {!check.valid ? (
          <>
            <h1 className="mt-2 font-display text-2xl uppercase tracking-tight">This link cannot be used</h1>
            <p className="mt-3 text-sm text-charcoal/70">{check.reason}.</p>
            <p className="mt-3 text-sm text-charcoal/70">
              Links work once and expire, so this often just means it has already been used. Request a new one and
              it will arrive within a minute or two.
            </p>
            <Link href="/forgot-password" className="btn-primary mt-6 w-full">Request a new link</Link>
          </>
        ) : (
          <>
            <h1 className="mt-2 font-display text-2xl uppercase tracking-tight">
              {check.record.purpose === "SET_INITIAL" ? "Choose your password" : "Set a new password"}
            </h1>
            <p className="mt-3 text-sm text-charcoal/70">
              For {check.record.user.email}. Once set, use it with your email address to sign in.
            </p>
            <div className="mt-6">
              <SetPasswordForm token={token!} purpose={check.record.purpose} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
