import { requireAdmin } from "@/lib/session";
import { adminAnalytics, parseRange } from "@/lib/analytics";
import { Panel } from "@/components/Panel";
import { KpiTile, RangeChips } from "@/components/analytics/kit";
import { FailureBreakdown, Leaderboard, SyncSwimlanes } from "@/components/analytics/AdminCharts";

/** Administrators only: integration health and who is using the portal. */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin();
  const range = parseRange((await searchParams).range);
  const data = await adminAnalytics(range);
  const k = data.kpis;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 className="page-title mt-2">Analytics</h1>
          <p className="mt-1 text-sm text-charcoal/60">
            Integration health and portal activity. Failures still waiting to be fixed are included whatever the range.
          </p>
        </div>
        <RangeChips basePath="/admin/analytics" value={range} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile label="Sync runs" value={k.runs} />
        <KpiTile label="Sync success rate" value={k.successRate} kind="pct" tone="accent" hint="Finished runs that succeeded" />
        <KpiTile label="Failures" value={k.failures} tone="alert" hint="Syncs, going live, purchase orders, email" />
        <KpiTile label="Active vendors" value={k.activeVendors} hint="Submitted, quoted or opened an RFQ" />
        <KpiTile label="Active staff" value={k.activeStaff} hint="Decided, raised or awarded" />
      </div>

      <Panel title="Sync health" subtitle="Every run by type. Problems only hides the successful ones.">
        <SyncSwimlanes runs={data.syncRuns} since={data.since} now={data.now} />
      </Panel>

      <Panel title="What is failing" subtitle="Grouped by error, most frequent first. Select one to see the full message.">
        <FailureBreakdown groups={data.failures} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Most active vendors" subtitle="Top 8 by actions in this period">
          <Leaderboard
            rows={data.vendors}
            parts={["Prices submitted", "Quotes submitted", "RFQs opened"]}
            empty="No vendor activity in this period."
          />
        </Panel>
        <Panel title="Most active staff" subtitle="Top 8 by actions in this period">
          <Leaderboard
            rows={data.staff}
            parts={["Decisions", "RFQs raised", "RFQs awarded"]}
            empty="No staff activity in this period."
          />
        </Panel>
      </div>
    </div>
  );
}
