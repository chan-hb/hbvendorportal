import type { MailMessage, MailResult } from "./types";
import { graphConfigured, sendViaGraph } from "./graph";
import { resendConfigured, sendViaResend } from "./resend";

export type { MailMessage, MailAttachment, MailResult } from "./types";
export { addressOf, displayNameOf } from "./types";
export { verifyGraphMailbox, graphConfigured, clearGraphTokenCache } from "./graph";

/**
 * One entry point for everything the portal sends.
 *
 * Graph is preferred when configured, since mail then originates from a real
 * Huda Beauty mailbox. Resend is the fallback for a deployment outside the
 * tenant. With neither, messages are written to the log so the flows can be
 * exercised before mail is arranged.
 *
 * Nothing here throws. A failed notification must never roll back the business
 * action that triggered it: a vendor being invited should not fail because
 * their mailbox bounced.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const to = Array.from(new Set(message.to.map((t) => t.trim().toLowerCase()).filter(Boolean)));
  if (to.length === 0) return { sent: false, skipped: "No recipients" };

  const payload = { ...message, to };

  if (graphConfigured()) return sendViaGraph(payload);
  if (resendConfigured()) return sendViaResend(payload);

  console.log(`[mail] would send to ${to.join(", ")} | ${message.subject}\n${message.text}`);
  return { sent: false, provider: "log", skipped: "Email is not configured, message logged instead" };
}

export function mailProvider(): "graph" | "resend" | "log" {
  if (graphConfigured()) return "graph";
  if (resendConfigured()) return "resend";
  return "log";
}

// ---------------------------------------------------------------- templates

/** Minimal branded shell, so the HTML and text versions stay in step. */
export function layout(opts: {
  heading: string;
  intro: string;
  rows?: [string, string][];
  ctaLabel?: string;
  ctaUrl?: string;
  outro?: string;
}): { html: string; text: string } {
  const rowsHtml = (opts.rows ?? [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#8a8384;font-size:11px;letter-spacing:.12em;text-transform:uppercase">${esc(
          k,
        )}</td><td style="padding:6px 0;color:#454041;font-size:14px">${esc(v)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f0edea;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #dfd9d4">
<tr><td style="padding:28px 32px 0"><div style="font-size:11px;font-weight:bold;letter-spacing:.2em;text-transform:uppercase;color:#ed3b86">Huda Beauty</div>
<h1 style="margin:12px 0 0;font-size:22px;line-height:1.2;text-transform:uppercase;color:#1a1a1a">${esc(opts.heading)}</h1></td></tr>
<tr><td style="padding:16px 32px;color:#454041;font-size:14px;line-height:1.6">${esc(opts.intro)}</td></tr>
${rowsHtml ? `<tr><td style="padding:0 32px"><table cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr>` : ""}
${
  opts.ctaUrl
    ? `<tr><td style="padding:24px 32px"><a href="${opts.ctaUrl}" style="display:inline-block;background:#ed3b86;color:#ffffff;text-decoration:none;padding:12px 22px;font-size:11px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase">${esc(
        opts.ctaLabel ?? "Open the portal",
      )}</a></td></tr>
<tr><td style="padding:0 32px 8px;color:#8a8384;font-size:11px;word-break:break-all">If the button does not work, paste this into your browser: ${esc(
        opts.ctaUrl,
      )}</td></tr>`
    : ""
}
${opts.outro ? `<tr><td style="padding:8px 32px 28px;color:#8a8384;font-size:12px;line-height:1.6">${esc(opts.outro)}</td></tr>` : `<tr><td style="height:12px"></td></tr>`}
</table></td></tr></table></body></html>`;

  const text = [
    opts.heading.toUpperCase(),
    "",
    opts.intro,
    "",
    ...(opts.rows ?? []).map(([k, v]) => `${k}: ${v}`),
    opts.ctaUrl ? `\n${opts.ctaLabel ?? "Open the portal"}: ${opts.ctaUrl}` : "",
    opts.outro ? `\n${opts.outro}` : "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return { html, text };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function appUrl(path = ""): string {
  const base =
    process.env.AUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base.replace(/\/+$/, "")}${path}`;
}
