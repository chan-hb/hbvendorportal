import type { MailMessage, MailResult } from "./types";

/** Kept as a fallback for anyone deploying outside a Microsoft tenant. */
export function resendConfigured(): boolean {
  return !!process.env.AUTH_RESEND_KEY;
}

export async function sendViaResend(message: MailMessage): Promise<MailResult> {
  const from = message.from ?? process.env.EMAIL_FROM;
  if (!from) return { sent: false, error: "No sending address is configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        ...(message.cc?.length ? { cc: message.cc } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString("base64"),
              })),
            }
          : {}),
      }),
    });

    if (!res.ok) {
      return { sent: false, provider: "resend", error: `Resend returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    return { sent: true, provider: "resend" };
  } catch (err) {
    return { sent: false, provider: "resend", error: (err as Error).message };
  }
}
