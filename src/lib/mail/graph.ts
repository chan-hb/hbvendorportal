import type { MailMessage, MailResult } from "./types";
import { addressOf } from "./types";

/**
 * Microsoft Graph mail.
 *
 * Sends as a real mailbox in the Huda Beauty tenant using application
 * permissions, so no user has to be signed in for the portal to send. The
 * message lands in that mailbox's Sent Items, which means a buyer can see what
 * went to a supplier and a reply comes back to a person rather than a void.
 *
 * One thing to be deliberate about: the Mail.Send application permission is
 * tenant wide by default. It should be scoped to the specific mailbox with an
 * application access policy in Exchange Online, or this app registration can
 * send as anyone in the company. See the notes.
 */

type CachedToken = { token: string; expiresAt: number };
let cache: CachedToken | null = null;

export function graphConfigured(): boolean {
  return !!(
    process.env.GRAPH_TENANT_ID &&
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET
  );
}

async function getToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now()) return cache.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.GRAPH_CLIENT_ID!,
    client_secret: process.env.GRAPH_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error(`Graph token request failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return json.access_token;
}

export function clearGraphTokenCache() {
  cache = null;
}

/**
 * Graph caps a sendMail request at roughly 4 MB including base64 encoding,
 * which inflates by about a third. Anything larger needs an upload session
 * against a draft, which is a lot of machinery for a brief. Oversized files are
 * left off and named in the result so the caller can say so rather than the
 * message silently failing.
 */
const MAX_ATTACHMENT_BYTES = 2_500_000;
const MAX_TOTAL_ATTACHMENT_BYTES = 3_000_000;

export async function sendViaGraph(message: MailMessage): Promise<MailResult> {
  const sender = addressOf(message.from) ?? process.env.GRAPH_SENDER;
  if (!sender) {
    return { sent: false, error: "No sending mailbox is configured. Set GRAPH_SENDER or choose a sender in the app." };
  }

  const omitted: string[] = [];
  const attachments: { "@odata.type": string; name: string; contentType: string; contentBytes: string }[] = [];
  let runningTotal = 0;

  for (const file of message.attachments ?? []) {
    if (file.content.length > MAX_ATTACHMENT_BYTES || runningTotal + file.content.length > MAX_TOTAL_ATTACHMENT_BYTES) {
      omitted.push(file.filename);
      continue;
    }
    runningTotal += file.content.length;
    attachments.push({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: file.filename,
      contentType: file.contentType ?? "application/octet-stream",
      contentBytes: file.content.toString("base64"),
    });
  }

  const html = omitted.length
    ? message.html.replace(
        "</body>",
        `<p style="font-family:Arial,sans-serif;font-size:12px;color:#8a8384;padding:0 32px">Some files were too large to attach (${omitted.join(
          ", ",
        )}). Sign in to the portal to download them.</p></body>`,
      )
    : message.html;

  const payload = {
    message: {
      subject: message.subject,
      body: { contentType: "HTML", content: html },
      toRecipients: message.to.map((address) => ({ emailAddress: { address } })),
      ...(message.cc?.length
        ? { ccRecipients: message.cc.map((address) => ({ emailAddress: { address } })) }
        : {}),
      ...(message.replyTo
        ? { replyTo: [{ emailAddress: { address: addressOf(message.replyTo) ?? message.replyTo } }] }
        : {}),
      ...(attachments.length ? { attachments } : {}),
    },
    // Keeps a copy in the buyer's Sent Items, so what went to a supplier is
    // visible where they would naturally look for it.
    saveToSentItems: true,
  };

  try {
    const token = await getToken();
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    // A successful sendMail returns 202 with no body.
    if (res.status === 202) {
      return { sent: true, provider: "graph", omittedAttachments: omitted.length ? omitted : undefined };
    }

    const detail = (await res.text()).slice(0, 600);
    return { sent: false, provider: "graph", error: explainGraphError(res.status, detail, sender) };
  } catch (err) {
    return { sent: false, provider: "graph", error: (err as Error).message };
  }
}

/** Graph errors are terse, so the common ones get translated. */
function explainGraphError(status: number, detail: string, sender: string): string {
  if (status === 403 && detail.includes("ApplicationAccessPolicy")) {
    return `Blocked by an application access policy: this app registration is not allowed to send as ${sender}. Ask IT to include that mailbox in the policy.`;
  }
  if (status === 403) {
    return `Permission denied sending as ${sender}. Check the Mail.Send application permission has been granted admin consent. (${detail})`;
  }
  if (status === 404) {
    return `The mailbox ${sender} was not found in the tenant. It must be a real, licensed mailbox, not a distribution list or an alias.`;
  }
  if (status === 401) {
    return `Authentication failed. Check the client secret has not expired. (${detail})`;
  }
  if (status === 413) {
    return "The message was too large. Reduce the attachments.";
  }
  return `Graph returned ${status}: ${detail}`;
}

/** Used by the test button, to prove the credentials work before relying on them. */
export async function verifyGraphMailbox(mailbox: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const token = await getToken();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}?$select=displayName,mail,userPrincipalName`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );

    if (res.ok) {
      const user = (await res.json()) as { displayName?: string; mail?: string };
      return { ok: true, detail: `Found ${user.displayName ?? mailbox}${user.mail ? ` (${user.mail})` : ""}.` };
    }

    if (res.status === 403) {
      return {
        ok: false,
        detail:
          "The token works, but reading directory data is not permitted. That is fine if only Mail.Send was granted; try the test email instead.",
      };
    }
    return { ok: false, detail: `Graph returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
