import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTemporaryPassword, hashPassword } from "@/lib/password";
import { hbAdminEmails } from "@/lib/rbac";

/**
 * One-time administrator bootstrap.
 *
 * Accounts are no longer created on first sign-in, so a fresh deployment has
 * nobody who can get in. This creates the first administrator and returns a
 * temporary password.
 *
 * Guarded three ways: it needs the CRON_SECRET as a bearer token, the address
 * must be listed in HB_ADMIN_EMAILS, and it refuses once any account has a
 * password set. That last condition is what makes it safe to leave deployed.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set, so bootstrap is disabled" }, { status: 400 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const alreadySetUp = await prisma.user.count({ where: { passwordHash: { not: null } } });
  if (alreadySetUp > 0) {
    return NextResponse.json(
      { error: "Somebody already has a password. Use Forgot password, or the Users page." },
      { status: 409 },
    );
  }

  const email = hbAdminEmails()[0];
  if (!email) return NextResponse.json({ error: "HB_ADMIN_EMAILS is not set" }, { status: 400 });

  const password = generateTemporaryPassword();
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      role: "HB_ADMIN",
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
    update: {
      role: "HB_ADMIN",
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      isActive: true,
    },
  });

  return NextResponse.json({
    email,
    password,
    note: "Sign in with this and you will be asked to change it immediately. This endpoint will now refuse to run again.",
  });
}
