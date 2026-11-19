import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Read-only roll-ups for the staff dashboard and the admin analytics page.
 *
 * Everything is computed from tables the portal already keeps. Volumes are
 * small (agreements and RFQs run to hundreds, not millions), so rows are read
 * once and aggregated here rather than in SQL, which keeps the definitions in
 * one readable place.
 *
 * Only numbers, dates, references and names cross to the client. Decimals are
 * converted to plain numbers on the way out.
 */

export const RANGES = [30, 90, 365] as const;
export type RangeDays = (typeof RANGES)[number];

export function parseRange(v?: string | string[]): RangeDays {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 90;
}

const DAY = 86_400_000;
const STAFF_ROLES: Role[] = ["HB_USER", "HB_APPROVER", "HB_ADMIN"];
/** A submission older than this is called out as waiting too long. */
export const WAITING_DAYS = 5;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Bucket = { key: string; label: string; start: number; end: number };

/** Weekly buckets for 30 and 90 days, monthly for a year. The last bucket ends now. */
function timeBuckets(days: RangeDays, now: Date): Bucket[] {
  const end = now.getTime() + 1;
  if (days >= 365) {
    const out: Bucket[] = [];
    for (let i = 11; i >= 0; i--) {
      const s = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      const e = i === 0 ? end : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1);
      const d = new Date(s);
      out.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
        start: s,
        end: e,
      });
    }
    return out;
  }
  const n = Math.ceil(days / 7);
  return Array.from({ length: n }, (_, i) => {
    const s = end - (n - i) * 7 * DAY;
    const d = new Date(s);
    return {
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      start: s,
      end: s + 7 * DAY,
    };
  });
}

function bucketOf(bs: Bucket[], t: number) {
  return bs.findIndex((b) => t >= b.start && t < b.end);
}

/** Equal slices of the range, for sparklines. */
function sparkIndex(t: number, since: number, now: number, slices = 12) {
  const i = Math.floor(((t - since) / (now - since)) * slices);
  return Math.min(slices - 1, Math.max(0, i));
}

// --------------------------------------------------------------- approvals

export type FunnelStage = { key: string; label: string; value: number; href: string };
export type FunnelOutcome = { label: string; value: number; href: string };
export type DecisionPoint = {
  key: string;
  label: string;
  median: number | null;
  count: number;
  slowest: { id: string; reference: string; days: number } | null;
};
export type PricePoint = {
  id: string;
  reference: string;
  vendor: string;
  itemNumber: string;
  itemName: string | null;
  currency: string;
  amount: number;
  previous: number;
  pct: number;
  status: string;
  at: number;
};

export async function approvalAnalytics(days: RangeDays) {
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);
  const waitingCutoff = new Date(now.getTime() - WAITING_DAYS * DAY);

  const [agreements, history, waiting] = await Promise.all([
    prisma.agreement.findMany({
      where: { submittedAt: { gte: since } },
      select: {
        id: true,
        reference: true,
        status: true,
        erpCreated: true,
        amount: true,
        currency: true,
        previousAmount: true,
        previousCurrency: true,
        itemNumber: true,
        itemName: true,
        submittedAt: true,
        vendor: { select: { name: true } },
      },
    }),
    // Submissions are read from further back so that a decision early in the
    // range can still be paired with the submission that preceded it.
    prisma.agreementHistory.findMany({
      where: {
        createdAt: { gte: new Date(since.getTime() - 90 * DAY) },
        action: { in: ["SUBMITTED", "RESUBMITTED", "APPROVED", "REJECTED", "CHANGE_REQUESTED"] },
      },
      select: { agreementId: true, action: true, createdAt: true, agreement: { select: { reference: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.agreement.findMany({
      where: { status: "SUBMITTED", submittedAt: { lt: waitingCutoff } },
      select: { submittedAt: true },
    }),
  ]);

  // Funnel: where the agreements submitted in this range have got to now.
  const count = (f: (a: (typeof agreements)[number]) => boolean) => agreements.filter(f).length;
  const submitted = agreements.length;
  const reviewed = count((a) => a.status !== "SUBMITTED" && a.status !== "DRAFT");
  const approved = count((a) => a.status === "APPROVED");
  const live = count((a) => a.status === "APPROVED" && a.erpCreated);
  const rejected = count((a) => a.status === "REJECTED");

  const funnel: FunnelStage[] = [
    { key: "submitted", label: "Submitted", value: submitted, href: "/agreements" },
    { key: "reviewed", label: "Reviewed", value: reviewed, href: "/agreements" },
    { key: "approved", label: "Approved", value: approved, href: "/agreements?status=APPROVED" },
    { key: "live", label: "Live", value: live, href: "/agreements?status=APPROVED&erp=created" },
  ];
  const outcomes: FunnelOutcome[] = [
    { label: "Awaiting decision", value: count((a) => a.status === "SUBMITTED"), href: "/agreements?status=SUBMITTED" },
    { label: "Change requested", value: count((a) => a.status === "CHANGE_REQUESTED"), href: "/agreements?status=CHANGE_REQUESTED" },
    { label: "Rejected", value: rejected, href: "/agreements?status=REJECTED" },
    { label: "Approved, not live", value: approved - live, href: "/agreements?status=APPROVED&erp=not_created" },
  ];

  // Time to decision: each decision paired with the submission before it, so
  // a resubmission after a change request is timed from the resubmission.
  const buckets = timeBuckets(days, now);
  const perBucket = buckets.map(() => [] as { id: string; reference: string; days: number }[]);
  const lastSubmit = new Map<string, number>();
  const allDays: number[] = [];
  for (const h of history) {
    const t = h.createdAt.getTime();
    if (h.action === "SUBMITTED" || h.action === "RESUBMITTED") {
      lastSubmit.set(h.agreementId, t);
      continue;
    }
    const from = lastSubmit.get(h.agreementId);
    lastSubmit.delete(h.agreementId);
    if (from === undefined || t < since.getTime()) continue;
    const i = bucketOf(buckets, t);
    if (i < 0) continue;
    const d = (t - from) / DAY;
    perBucket[i].push({ id: h.agreementId, reference: h.agreement.reference, days: d });
    allDays.push(d);
  }
  const decisionTime: DecisionPoint[] = buckets.map((b, i) => {
    const xs = perBucket[i];
    const slowest = xs.reduce<(typeof xs)[number] | null>((m, x) => (!m || x.days > m.days ? x : m), null);
    return { key: b.key, label: b.label, median: median(xs.map((x) => x.days)), count: xs.length, slowest };
  });

  const prices: PricePoint[] = agreements
    .filter(
      (a) =>
        a.submittedAt &&
        a.previousAmount !== null &&
        Number(a.previousAmount) > 0 &&
        (a.previousCurrency ?? a.currency) === a.currency,
    )
    .map((a) => {
      const amount = Number(a.amount);
      const previous = Number(a.previousAmount);
      return {
        id: a.id,
        reference: a.reference,
        vendor: a.vendor.name,
        itemNumber: a.itemNumber,
        itemName: a.itemName,
        currency: a.currency,
        amount,
        previous,
        pct: ((amount - previous) / previous) * 100,
        status: a.status,
        at: a.submittedAt!.getTime(),
      };
    });

  const oldestWaiting = waiting.reduce(
    (m, w) => Math.max(m, w.submittedAt ? (now.getTime() - w.submittedAt.getTime()) / DAY : 0),
    0,
  );

  return {
    since: since.getTime(),
    now: now.getTime(),
    funnel,
    outcomes,
    decisionTime,
    prices,
    kpis: {
      medianDecisionDays: median(allDays),
      decisions: allDays.length,
      waitingTooLong: waiting.length,
      oldestWaitingDays: oldestWaiting,
      avgPriceChange: prices.length ? prices.reduce((t, p) => t + p.pct, 0) / prices.length : null,
      priceChanges: prices.length,
      approvalRate: approved + rejected > 0 ? (approved / (approved + rejected)) * 100 : null,
    },
  };
}

// --------------------------------------------------------------------- RFQs

export type ResponseRow = {
  id: string;
  reference: string;
  title: string;
  submitted: number;
  viewed: number;
  declined: number;
  notOpened: number;
  total: number;
};
export type SpreadRow = {
  id: string;
  reference: string;
  title: string;
  currency: string;
  bids: { id: string; vendor: string; price: number }[];
  awardedId: string | null;
  min: number;
  max: number;
};

export async function rfqAnalytics(days: RangeDays) {
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);

  const rfqs = await prisma.rfq.findMany({
    where: { createdAt: { gte: since }, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      reference: true,
      title: true,
      currency: true,
      awardedBidId: true,
      invitations: { select: { status: true } },
      bids: {
        where: { status: "SUBMITTED", referencePrice: { not: null } },
        select: { id: true, referencePrice: true, vendor: { select: { name: true } } },
      },
    },
  });

  let invited = 0;
  let answered = 0;
  const responses: ResponseRow[] = [];
  for (const r of rfqs) {
    if (r.invitations.length === 0) continue;
    const c = { INVITED: 0, VIEWED: 0, SUBMITTED: 0, DECLINED: 0 };
    for (const i of r.invitations) c[i.status]++;
    invited += r.invitations.length;
    answered += c.SUBMITTED + c.DECLINED;
    if (responses.length < 10) {
      responses.push({
        id: r.id,
        reference: r.reference,
        title: r.title,
        submitted: c.SUBMITTED,
        viewed: c.VIEWED,
        declined: c.DECLINED,
        notOpened: c.INVITED,
        total: r.invitations.length,
      });
    }
  }

  const spreads: SpreadRow[] = rfqs
    .filter((r) => r.bids.length > 0)
    .slice(0, 10)
    .map((r) => {
      const bids = r.bids
        .map((b) => ({ id: b.id, vendor: b.vendor.name, price: Number(b.referencePrice) }))
        .sort((a, b) => a.price - b.price);
      return {
        id: r.id,
        reference: r.reference,
        title: r.title,
        currency: r.currency,
        bids,
        awardedId: r.awardedBidId,
        min: bids[0].price,
        max: bids[bids.length - 1].price,
      };
    });

  return {
    responses,
    spreads,
    kpis: { responseRate: invited > 0 ? (answered / invited) * 100 : null, invited, rfqs: rfqs.length },
  };
}

// -------------------------------------------------------------------- admin

export type RunStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "RUNNING" | "STALLED";
export type SyncRunPoint = {
  id: string;
  type: string;
  status: RunStatus;
  trigger: string;
  start: number;
  end: number | null;
  processed: number;
  failed: number;
  message: string | null;
};
export type FailureSource = "Sync" | "Going live" | "Purchase orders" | "Email";
export type FailureGroup = {
  key: string;
  source: FailureSource;
  detail: string;
  pattern: string;
  sample: string;
  count: number;
  lastSeen: number;
  href: string;
};
export type Leader = { id: string; name: string; sub: string | null; total: number; parts: number[]; spark: number[] };

/** A RUNNING row whose heartbeat has gone quiet was killed, not still working. */
const STALE_MS = 15 * 60_000;

/** Collapse ids and numbers so that the same fault reads as one group. */
function errorPattern(msg: string) {
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export async function adminAnalytics(days: RangeDays) {
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);
  const s = since.getTime();
  const n = now.getTime();

  const [runs, stuckAgreements, poFailures, mailFailures, vendorSubs, bids, views, decisions, rfqsCreated, awards, staff] =
    await Promise.all([
      prisma.syncRun.findMany({
        where: { startedAt: { gte: since } },
        orderBy: { startedAt: "asc" },
        take: 5000,
        select: {
          id: true,
          type: true,
          status: true,
          trigger: true,
          startedAt: true,
          finishedAt: true,
          heartbeatAt: true,
          processed: true,
          failed: true,
          message: true,
        },
      }),
      // Current problems, whatever the range: these are still waiting on someone.
      prisma.agreement.findMany({
        where: { status: "APPROVED", erpCreated: false, erpError: { not: null } },
        select: { reference: true, erpError: true, updatedAt: true },
      }),
      prisma.vendorPoRefresh.findMany({
        where: { status: "FAILED" },
        select: { error: true, finishedAt: true, startedAt: true, vendor: { select: { name: true } } },
      }),
      prisma.rfqEvent.findMany({
        where: { type: "NOTIFICATION_FAILED", createdAt: { gte: since } },
        select: { detail: true, createdAt: true, rfqId: true },
      }),
      prisma.agreementHistory.findMany({
        where: { createdAt: { gte: since }, action: { in: ["SUBMITTED", "RESUBMITTED"] }, actorRole: "VENDOR" },
        select: { createdAt: true, agreement: { select: { vendorId: true, vendor: { select: { name: true, code: true } } } } },
      }),
      prisma.bid.findMany({
        where: { submittedAt: { gte: since } },
        select: { submittedAt: true, vendorId: true, vendor: { select: { name: true, code: true } } },
      }),
      prisma.rfqInvitation.findMany({
        where: { viewedAt: { gte: since } },
        select: { viewedAt: true, vendorId: true, vendor: { select: { name: true, code: true } } },
      }),
      prisma.agreementHistory.findMany({
        where: {
          createdAt: { gte: since },
          action: { in: ["APPROVED", "REJECTED", "CHANGE_REQUESTED"] },
          actorRole: { in: STAFF_ROLES },
        },
        select: { createdAt: true, actorEmail: true },
      }),
      prisma.rfq.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, createdBy: { select: { email: true } } },
      }),
      prisma.rfq.findMany({
        where: { awardedAt: { gte: since } },
        select: { awardedAt: true, awardedBy: true },
      }),
      prisma.user.findMany({ where: { role: { in: STAFF_ROLES } }, select: { email: true, name: true, role: true } }),
    ]);

  // Sync health
  const syncRuns: SyncRunPoint[] = runs.map((r) => {
    const beat = (r.heartbeatAt ?? r.startedAt).getTime();
    const status: RunStatus = r.status === "RUNNING" && n - beat > STALE_MS ? "STALLED" : r.status;
    return {
      id: r.id,
      type: r.type,
      status,
      trigger: r.trigger,
      start: r.startedAt.getTime(),
      end: (r.finishedAt ?? (status === "STALLED" ? r.heartbeatAt : null))?.getTime() ?? null,
      processed: r.processed,
      failed: r.failed,
      message: r.message,
    };
  });

  // Failures, grouped by what went wrong rather than listed one by one.
  const groups = new Map<string, FailureGroup>();
  const add = (source: FailureSource, detail: string, msg: string | null, at: number, href: string) => {
    const raw = (msg ?? "").trim() || "No error message was recorded";
    const pattern = errorPattern(raw);
    const key = `${source}|${detail}|${pattern}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (at > g.lastSeen) {
        g.lastSeen = at;
        g.sample = raw.slice(0, 600);
      }
    } else {
      groups.set(key, { key, source, detail, pattern, sample: raw.slice(0, 600), count: 1, lastSeen: at, href });
    }
  };
  for (const r of syncRuns) {
    if (r.status === "FAILED" || r.status === "PARTIAL" || r.status === "STALLED") {
      const msg = r.status === "STALLED" && !r.message ? "Stopped without finishing (no heartbeat)" : r.message;
      add("Sync", r.type.replace(/_/g, " ").toLowerCase(), msg, r.start, "/admin/integration");
    }
  }
  for (const a of stuckAgreements) {
    add("Going live", "approved agreements", a.erpError, a.updatedAt.getTime(), "/agreements?status=APPROVED&erp=not_created");
  }
  for (const p of poFailures) {
    add("Purchase orders", "sign-in refresh", p.error, (p.finishedAt ?? p.startedAt ?? now).getTime(), "/admin/vendors");
  }
  for (const e of mailFailures) {
    add("Email", "RFQ notifications", e.detail, e.createdAt.getTime(), `/rfq/${e.rfqId}`);
  }
  const failures = [...groups.values()].sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);

  // Most active vendors: price submissions, quotes submitted, RFQs opened.
  const vendorMap = new Map<string, Leader>();
  const vendorHit = (id: string, name: string, code: string, part: number, at: number) => {
    let v = vendorMap.get(id);
    if (!v) {
      v = { id, name, sub: code, total: 0, parts: [0, 0, 0], spark: Array(12).fill(0) };
      vendorMap.set(id, v);
    }
    v.total++;
    v.parts[part]++;
    v.spark[sparkIndex(at, s, n)]++;
  };
  for (const h of vendorSubs)
    vendorHit(h.agreement.vendorId, h.agreement.vendor.name, h.agreement.vendor.code, 0, h.createdAt.getTime());
  for (const b of bids) vendorHit(b.vendorId, b.vendor.name, b.vendor.code, 1, b.submittedAt!.getTime());
  for (const v of views) vendorHit(v.vendorId, v.vendor.name, v.vendor.code, 2, v.viewedAt!.getTime());

  // Most active staff: decisions, RFQs raised, RFQs awarded.
  const names = new Map(staff.map((u) => [u.email.toLowerCase(), u]));
  const staffMap = new Map<string, Leader>();
  const staffHit = (email: string | null | undefined, part: number, at: number) => {
    if (!email) return;
    const key = email.toLowerCase();
    let v = staffMap.get(key);
    if (!v) {
      const u = names.get(key);
      v = { id: key, name: u?.name || key, sub: u ? roleName(u.role) : null, total: 0, parts: [0, 0, 0], spark: Array(12).fill(0) };
      staffMap.set(key, v);
    }
    v.total++;
    v.parts[part]++;
    v.spark[sparkIndex(at, s, n)]++;
  };
  for (const d of decisions) staffHit(d.actorEmail, 0, d.createdAt.getTime());
  for (const r of rfqsCreated) staffHit(r.createdBy.email, 1, r.createdAt.getTime());
  for (const a of awards) staffHit(a.awardedBy, 2, a.awardedAt!.getTime());

  const rank = (m: Map<string, Leader>) => [...m.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  const finished = syncRuns.filter((r) => r.status !== "RUNNING");
  const ok = finished.filter((r) => r.status === "SUCCESS").length;

  return {
    since: s,
    now: n,
    syncRuns,
    failures,
    vendors: rank(vendorMap),
    staff: rank(staffMap),
    kpis: {
      runs: syncRuns.length,
      successRate: finished.length ? (ok / finished.length) * 100 : null,
      failures: failures.reduce((t, g) => t + g.count, 0),
      activeVendors: vendorMap.size,
      activeStaff: staffMap.size,
    },
  };
}

function roleName(role: Role) {
  return role === "HB_ADMIN" ? "Administrator" : role === "HB_APPROVER" ? "Approver" : "Huda Beauty";
}
