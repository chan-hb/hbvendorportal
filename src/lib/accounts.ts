import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, layout, sendMail } from "@/lib/mail";
import { resolveAccess } from "@/lib/access";
import {
  checkPasswordStrength,
  createToken,
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/lib/password";

const SETUP_HOURS = 72;
const RESET_HOURS = 2;

/**
 * Outbound mail identity.
 *
 * Everything the portal sends goes out under a named Huda Beauty person rather
 * than a no-reply address, so a supplier who replies reaches somebody. The
 * address still has to be on a domain verified with the mail provider, which
 * is the constraint that decides whether this works at all.
 */
export async function systemSender(): Promise<{ from?: string; replyTo?: string }> {
  const settings = await prisma.rfqSetting.findUnique({ where: { id: "default" } });

  let email = settings?.fromEmail ?? null;
  let name = settings?.fromName ?? "Huda Beauty";

  if (settings?.senderUserId) {
    const sender = await prisma.user.findUnique({
      where: { id: settings.senderUserId },
      select: { email: true, name: true, isActive: true },
    });
    if (sender?.isActive) {
      email = sender.email;
      name = sender.name ?? settings.fromName;
    }
  }

  // Fall back to the first administrator, so mail is attributable even before
  // anyone has configured this.
  if (!email) {
    const admin = await prisma.user.findFirst({
      where: { role: "HB_ADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { email: true, name: true },
    });
    if (admin) {
      email = admin.email;
      name = admin.name ?? name;
    }
  }

  if (!email) return {};
  return { from: `${name} <${email}>`, replyTo: settings?.replyTo ?? email };
}

// ---------------------------------------------------------------- user creation

export async function createUserAccount(
  actorEmail: string,
  input: { email: string; name?: string; role?: Role; vendorId?: string | null },
) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter a valid email address");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error(`${email} already has an account`);

  // The access rules decide the role, not whoever filled in the form, so a
  // vendor address cannot be created as staff by mistake.
  const decision = await resolveAccess(email);
  if (!decision.allowed) {
    throw new Error(
      `${email} is not recognised. Add their domain or allow-list the address on the Vendors page first.`,
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name?.trim(),
      role: input.role && decision.role !== "VENDOR" ? input.role : decision.role,
      vendorId: decision.vendorId,
      mustChangePassword: true,
    },
  });

  return user;
}

// ---------------------------------------------------------------- setup and reset

async function issueToken(userId: string, purpose: "SET_INITIAL" | "RESET", createdBy?: string) {
  // Older tokens for the same person are retired, so a forwarded email cannot
  // be used after a newer request.
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const { token, tokenHash } = createToken();
  const hours = purpose === "SET_INITIAL" ? SETUP_HOURS : RESET_HOURS;

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      purpose,
      expiresAt: new Date(Date.now() + hours * 3600_000),
      createdBy,
    },
  });

  return { token, hours };
}

export async function sendSetupLink(userId: string, actorEmail?: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { vendor: { select: { name: true } } },
  });

  const { token, hours } = await issueToken(userId, "SET_INITIAL", actorEmail);
  const url = appUrl(`/set-password?token=${token}`);

  const body = layout({
    heading: "Set up your portal account",
    intro: `An account has been created for you on the Huda Beauty vendor portal${
      user.vendor ? ` for ${user.vendor.name}` : ""
    }. Choose a password to get started.`,
    rows: [
      ["Sign in with", user.email],
      ["Link expires", `${hours} hours from now`],
    ],
    ctaLabel: "Choose your password",
    ctaUrl: url,
    outro: "If you were not expecting this, ignore it and the link will expire on its own.",
  });

  const result = await sendMail({
    to: [user.email],
    subject: "Set up your Huda Beauty portal account",
    ...body,
    ...(await systemSender()),
  });

  return { ...result, url };
}

/**
 * Always reports success. Telling an anonymous caller whether an address has an
 * account here turns the form into a way of enumerating our suppliers.
 */
export async function requestPasswordReset(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) return { sent: true };

  const { token, hours } = await issueToken(user.id, "RESET");
  const url = appUrl(`/set-password?token=${token}`);

  const body = layout({
    heading: "Reset your password",
    intro:
      "Somebody asked to reset the password on this account. Choose a new one using the link below. Your current password keeps working until you do.",
    rows: [
      ["Account", user.email],
      ["Link expires", `${hours} hours from now`],
    ],
    ctaLabel: "Choose a new password",
    ctaUrl: url,
    outro: "If this was not you, no action is needed. Tell your Huda Beauty contact if it keeps happening.",
  });

  await sendMail({
    to: [user.email],
    subject: "Reset your Huda Beauty portal password",
    ...body,
    ...(await systemSender()),
  });

  return { sent: true, url };
}

export async function consumeToken(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, isActive: true } } },
  });

  if (!record) return { valid: false as const, reason: "That link is not valid" };
  if (record.usedAt) return { valid: false as const, reason: "That link has already been used" };
  if (record.expiresAt < new Date()) return { valid: false as const, reason: "That link has expired" };
  if (!record.user.isActive) return { valid: false as const, reason: "That account is not active" };

  return { valid: true as const, record };
}

export async function setPasswordWithToken(token: string, password: string) {
  const check = await consumeToken(token);
  if (!check.valid) throw new Error(check.reason);

  const problems = checkPasswordStrength(password, check.record.user.email);
  if (problems.length) throw new Error(problems.join(". "));

  await prisma.$transaction([
    prisma.user.update({
      where: { id: check.record.userId },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        emailVerified: new Date(),
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: check.record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return check.record.user.email;
}

export async function changeOwnPassword(userId: string, current: string, next: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  // Someone on a temporary password does not need to prove the old one twice:
  // they proved it by signing in, and the point is to get them off it quickly.
  if (user.passwordHash && !user.mustChangePassword) {
    const ok = await verifyPassword(current, user.passwordHash);
    if (!ok) throw new Error("Your current password is not right");
  }

  const problems = checkPasswordStrength(next, user.email);
  if (problems.length) throw new Error(problems.join(". "));

  if (user.passwordHash && (await verifyPassword(next, user.passwordHash))) {
    throw new Error("Choose a password you have not used here before");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
}

/**
 * For when email is not working and a buyer has to read a password out. The
 * account is flagged so it has to be changed at first sign-in.
 */
export async function issueTemporaryPassword(userId: string) {
  const password = generateTemporaryPassword();

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      passwordUpdatedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  return password;
}

export async function unlockAccount(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}
