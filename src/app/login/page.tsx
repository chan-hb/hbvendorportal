import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInForm } from "@/components/AuthForms";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[7fr_5fr]">
      {/* Cover treatment: full-bleed Power Pink, white display text bottom
          left, wordmark small in the corner. */}
      <section className="relative hidden flex-col justify-end bg-pink p-12 lg:flex">
        <h1 className="font-display text-[84px] font-black uppercase leading-[0.84] tracking-[-0.02em] text-white">
          Supplier
          <br />
          Portal
        </h1>
        <p className="mt-8 max-w-sm text-sm leading-relaxed text-white/85">
          Quotations, trade agreements and pricing, in one place.
        </p>
        {/*
          White wordmark on pink, per the logo rules.

          A separate white asset rather than recolouring the black one in the
          browser. A brightness/invert filter and a CSS mask both failed here,
          and neither is worth debugging for a decorative mark: a second PNG is
          two kilobytes and works everywhere with no decoding tricks.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hb-logo-white.png"
          alt="Huda Beauty"
          width={2048}
          height={358}
          className="absolute bottom-10 right-12 w-44"
        />
      </section>

      <section className="flex flex-col justify-center px-8 py-16 sm:px-16">
        {/* Centred above the form, on every screen size. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hb-logo.png"
          alt="Huda Beauty"
          width={2048}
          height={358}
          className="mx-auto mb-12 w-56 sm:w-64"
        />
        <p className="eyebrow text-center">Sign in</p>
        <h2 className="page-title mt-2 text-center">
          Welcome back
        </h2>
        <p className="mt-3 text-center text-sm text-charcoal/70">
          Use the email address your account was set up with. If you have not set a password yet, check your inbox
          for the set-up link, or ask your Huda Beauty contact to send another.
        </p>

        {error ? (
          <div className="mt-6 alert-error">
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
