import type { D365Config } from "./config";

type CachedToken = { token: string; expiresAt: number };
const cache = new Map<string, CachedToken>();

/**
 * OAuth 2.0 client credentials against Entra ID.
 * Tokens are cached in-process until 60s before expiry.
 */
export async function getAccessToken(cfg: D365Config): Promise<string> {
  const cacheKey = `${cfg.tenantId}:${cfg.clientId}:${cfg.scope}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: cfg.scope,
  });

  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cache.set(cacheKey, { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 });
  return json.access_token;
}

export function clearTokenCache() {
  cache.clear();
}
