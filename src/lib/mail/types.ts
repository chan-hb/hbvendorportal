export type MailAttachment = { filename: string; content: Buffer; contentType?: string };

export type MailMessage = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** Overrides the configured sender. */
  from?: string;
  replyTo?: string;
  cc?: string[];
  attachments?: MailAttachment[];
};

export type MailResult = {
  sent: boolean;
  provider?: "graph" | "resend" | "log";
  skipped?: string;
  error?: string;
  /** Files left off because the provider could not carry them. */
  omittedAttachments?: string[];
};

/** Pulls a bare address out of "Name <address>". */
export function addressOf(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase() || null;
}

export function displayNameOf(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^([^<]+)</);
  return match ? match[1].trim().replace(/^"|"$/g, "") : null;
}
