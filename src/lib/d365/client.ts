import { getAccessToken } from "./token";
import type { D365Config } from "./config";

export type ODataQuery = {
  select?: string[];
  filter?: string;
  orderby?: string;
  top?: number;
  crossCompany?: boolean;
};

function buildUrl(cfg: D365Config, entity: string, q: ODataQuery = {}): string {
  const url = new URL(`${cfg.resourceUrl}/data/${entity}`);
  if (q.select?.length) url.searchParams.set("$select", q.select.join(","));
  if (q.filter) url.searchParams.set("$filter", q.filter);
  if (q.orderby) url.searchParams.set("$orderby", q.orderby);
  url.searchParams.set("$top", String(q.top ?? cfg.pageSize));
  if (q.crossCompany) url.searchParams.set("cross-company", "true");
  return url.toString();
}

async function authorisedFetch(cfg: D365Config, url: string, init: RequestInit = {}) {
  const token = await getAccessToken(cfg);
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}

export type ODataPage<T> = {
  rows: T[];
  /** Pass back in to continue. Undefined means the entity set is exhausted. */
  nextLink?: string;
  pageNumber: number;
};

/**
 * Yields one page at a time so the caller can write it away and let it be
 * collected. Nothing accumulates, which is what makes a several hundred
 * thousand row entity survivable in a memory capped function.
 *
 * Pass `startUrl` to resume from a checkpoint rather than starting over.
 */
export async function* odataPages<T>(
  cfg: D365Config,
  entity: string,
  q: ODataQuery = {},
  startUrl?: string | null,
): AsyncGenerator<ODataPage<T>> {
  let url: string | undefined = startUrl ?? buildUrl(cfg, entity, q);
  let pageNumber = 0;

  while (url) {
    const res = await authorisedFetch(cfg, url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GET ${entity} failed (${res.status}): ${text.slice(0, 800)}`);
    }
    const json = (await res.json()) as { value: T[]; "@odata.nextLink"?: string };
    pageNumber += 1;
    const nextLink = json["@odata.nextLink"];

    yield { rows: json.value ?? [], nextLink, pageNumber };

    url = nextLink;
  }
}

/**
 * Buffers every page. Only safe for small entity sets such as the vendor
 * master. Use odataPages for anything that can grow.
 */
export async function odataGetAll<T>(
  cfg: D365Config,
  entity: string,
  q: ODataQuery = {},
  maxPages = 200,
): Promise<T[]> {
  const out: T[] = [];
  for await (const page of odataPages<T>(cfg, entity, q)) {
    out.push(...page.rows);
    if (page.pageNumber >= maxPages) break;
  }
  return out;
}

export async function odataPost<T>(cfg: D365Config, entity: string, payload: unknown): Promise<T> {
  const res = await authorisedFetch(cfg, `${cfg.resourceUrl}/data/${entity}?cross-company=true`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${entity} failed (${res.status}): ${text.slice(0, 800)}`);
  }
  return (await res.json()) as T;
}

/** Lightweight connectivity probe used by the "Test connection" button. */
export async function odataPing(cfg: D365Config): Promise<{ ok: true; sample: number }> {
  for await (const page of odataPages<Record<string, unknown>>(cfg, cfg.itemEntity, {
    top: 1,
    crossCompany: true,
  })) {
    return { ok: true, sample: page.rows.length };
  }
  return { ok: true, sample: 0 };
}
