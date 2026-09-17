import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInForm } from "@/components/AuthForms";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[7fr_5fr]">
      <section className="relative hidden flex-col justify-end bg-pink p-12 lg:flex">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/70">Supplier portal</p>
        <h1 className="mt-4 font-display text-[92px] leading-[0.82] tracking-[-0.03em] text-white">
          HUDA
          <br />
          BEAUTY
        </h1>
        <p className="mt-8 max-w-sm text-sm leading-relaxed text-white/85">
          Quotations, trade agreements and pricing, in one place.
        </p>
      </section>

      <section className="flex flex-col justify-center px-8 py-16 sm:px-16">
        <p className="eyebrow">Sign in</p>
        <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-charcoal">Welcome back</h2>
        <p className="mt-3 text-sm text-charcoal/70">
          Use the email address your account was set up with. If you have not set a password yet, check your inbox
          for the set-up link, or ask your Huda Beauty contact to send another.
        </p>

        {error ? (
          <div className="mt-6 border border-[#A32B2B]/30 bg-[#FBEAEA] px-4 py-3 text-sm text-[#A32B2B]">
            {decodeURIComponent(error)}
          </div>
        ) : null}

        <div className="mt-8">
          <SignInForm entraEnabled={!!process.env.AUTH_MICROSOFT_ENTRA_ID_ID} />
        </div>
      </section>
    </main>
  );
}
