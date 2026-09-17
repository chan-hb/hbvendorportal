import Link from "next/link";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dateTime } from "@/lib/format";
import { Panel } from "@/components/Panel";
import { ChangePasswordForm } from "@/components/AuthForms";

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mustChangePassword: true, passwordUpdatedAt: true, passwordHash: true },
  });

  const forced = !!record?.mustChangePassword;

  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-16">
      <div>
        <p className="eyebrow">Your account</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">
          {forced ? "Choose a new password" : "Change your password"}
        </h1>
        <p className="mt-2 text-sm text-charcoal/60">
          {forced
            ? "You are signed in with a temporary password. Choose your own before carrying on."
            : record?.passwordUpdatedAt
              ? `Last changed ${dateTime(record.passwordUpdatedAt)}.`
              : "You have not set a password yet."}
        </p>
      </div>

      <Panel>
        <div className="p-6">
          <ChangePasswordForm forced={forced} />
        </div>
      </Panel>

      {!record?.passwordHash ? (
        <p className="text-sm text-charcoal/60">
          You signed in with Microsoft, so you do not need a password here. Setting one gives you a second way in.
        </p>
      ) : null}

      <div className="flex items-center justify-between border-t border-line pt-5">
        {forced ? (
          <span className="text-xs text-charcoal/55">The portal opens once you have changed it.</span>
        ) : (
          <Link href="/" className="text-[11px] font-bold uppercase tracking-[0.12em] text-pink hover:underline">
            Back to the portal
          </Link>
        )}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="text-[11px] font-bold uppercase tracking-[0.12em] text-charcoal/50 hover:text-pink">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
