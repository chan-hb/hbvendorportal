"use server";

import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/session";
import {
  changeOwnPassword,
  createUserAccount,
  issueTemporaryPassword,
  requestPasswordReset,
  sendSetupLink,
  setPasswordWithToken,
  unlockAccount,
} from "@/lib/accounts";
import { addressOf, appUrl, layout, mailProvider, sendMail, verifyGraphMailbox } from "@/lib/mail";
import { systemSender } from "@/lib/accounts";
import type { ActionState } from "./agreements";
import type { Role } from "@prisma/client";

export type AuthState = { error?: string; ok?: string; secret?: string } | null;

// ---------------------------------------------------------------- signing in

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password" };

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
    return null;
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;

    if (err instanceof AuthError) {
      // One message for every failure. Distinguishing "no such account" from
      // "wrong password" would let anyone test whether a supplier works here.
      return {
        error:
          "That email and password do not match, or the account is locked. After several failed attempts, wait a few minutes and try again.",
      };
    }
    return { error: "Something went wrong signing you in. Try again." };
  }
}

// ---------------------------------------------------------------- forgotten passwords

export async function requestResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  if (!email.includes("@")) return { error: "Enter your email address" };

  await requestPasswordReset(email);

  // Deliberately the same answer whether or not the account exists.
  return {
    ok: "If that address has an account, a reset link is on its way. It is valid for two hours.",
  };
}

export async function setPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) return { error: "The two passwords do not match" };

  try {
    await setPasswordWithToken(token, password);
    return { ok: "Your password is set. You can sign in now." };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function changePasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm) return { error: "The two new passwords do not match" };

  try {
    await changeOwnPassword(user.id, current, next);
    revalidatePath("/account/password");
    return { ok: "Password changed." };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ---------------------------------------------------------------- administration

export async function createUserAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "");
  const name = String(formData.get("name") ?? "") || undefined;
  const role = (String(formData.get("role") ?? "") || undefined) as Role | undefined;

  try {
    const user = await createUserAccount(admin.email, { email, name, role });
    const result = await sendSetupLink(user.id, admin.email);
    revalidatePath("/admin/users");

    return {
      ok: result.sent
        ? `${user.email} created. A set-up link has been emailed.`
        : `${user.email} created, but the email could not be sent (${result.error ?? result.skipped}). Use "Temporary password" to give them access another way.`,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function sendSetupLinkAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const admin = await requireAdmin();
  try {
    const result = await sendSetupLink(String(formData.get("userId")), admin.email);
    revalidatePath("/admin/users");
    return result.sent
      ? { ok: "Set-up link sent." }
      : { error: `Could not send the email: ${result.error ?? result.skipped}` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function temporaryPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  await requireAdmin();
  try {
    const password = await issueTemporaryPassword(String(formData.get("userId")));
    revalidatePath("/admin/users");
    return {
      ok: "Temporary password set. It is shown once, so pass it on now. They must change it when they sign in.",
      secret: password,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function unlockAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  await unlockAccount(String(formData.get("userId")));
  revalidatePath("/admin/users");
  return { ok: "Account unlocked." };
}

export async function setSenderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const userId = String(formData.get("senderUserId") ?? "") || null;

  try {
    await prisma.rfqSetting.upsert({
      where: { id: "default" },
      create: { id: "default", senderUserId: userId, standardTiers: [] },
      update: { senderUserId: userId },
    });
    revalidatePath("/admin/rfq-settings");
    return { ok: userId ? "Outgoing mail will come from that person." : "Sender cleared." };
  } catch (err) {
    return { error: (err as Error).message };
  }
}


// ---------------------------------------------------------------- mail diagnostics

/**
 * Proves the mail path end to end before anyone relies on it. Sends to the
 * signed-in administrator rather than an arbitrary address, so the button
 * cannot be used to send mail to strangers.
 */
export async function sendTestEmailAction(_prev: AuthState, _formData: FormData): Promise<AuthState> {
  const admin = await requireAdmin();
  const provider = mailProvider();

  if (provider === "log") {
    return {
      error:
        "No mail provider is configured, so nothing was sent. Set the Graph credentials in Vercel and redeploy.",
    };
  }

  const sender = await systemSender();
  const mailbox = addressOf(sender.from);

  // Check the mailbox exists before trying to send as it, since a wrong
  // address gives a clearer error here than a generic send failure.
  if (provider === "graph" && mailbox) {
    const check = await verifyGraphMailbox(mailbox);
    if (!check.ok && !check.detail.includes("reading directory data")) {
      return { error: `Could not use ${mailbox}: ${check.detail}` };
    }
  }

  const body = layout({
    heading: "Test message",
    intro: `This confirms the portal can send email. It was sent as ${mailbox ?? "the configured address"} using ${
      provider === "graph" ? "Microsoft Graph" : "Resend"
    }.`,
    rows: [
      ["Sent as", mailbox ?? "not resolved"],
      ["Replies go to", addressOf(sender.replyTo) ?? mailbox ?? "not set"],
      ["Requested by", admin.email],
    ],
    ctaLabel: "Open the portal",
    ctaUrl: appUrl("/"),
    outro:
      provider === "graph"
        ? "A copy should also appear in the sending mailbox's Sent Items. If it does not, the send worked but saveToSentItems was rejected."
        : undefined,
  });

  const result = await sendMail({
    to: [admin.email],
    subject: "Huda Beauty portal, test message",
    ...body,
    ...sender,
  });

  if (result.sent) {
    return {
      ok: `Sent to ${admin.email} as ${mailbox ?? "the configured address"}. If it does not arrive within a few minutes, check the mailbox's junk folder before assuming it failed.`,
    };
  }
  return { error: result.error ?? result.skipped ?? "The send failed for an unknown reason" };
}
