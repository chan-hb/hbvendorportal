import { prisma } from "@/lib/prisma";
import { reapStaleRuns } from "@/lib/d365/checkpoint";
import { requireAdmin } from "@/lib/session";
import { getRawSettings } from "@/lib/d365/config";
import { dateTime } from "@/lib/format";
import { Panel } from "@/components/Panel";
import { IntegrationForm } from "@/components/IntegrationForm";
import { SyncControls } from "@/components/SyncControls";

/**
 * The manual refresh buttons are server actions on this page, so they run
 * inside this route segment and inherit its limit.
 *
 * On Vercel this is the function timeout. On Azure App Service it has no
 * effect: there is no function limit, but the front-end load balancer closes
 * an idle request at around 230 seconds, so the sync time budget still has to
 * sit below that. Keep the budget at 180 or less either way.
 */
export const maxDuration = 300;

export default async function IntegrationPage() {
  await requireAdmin();
  // Close out runs a previous timeout left showing as running.
  await reapStaleRuns();
  const [settings, runs, checkpoints] = await Promise.all([
    getRawSettings(),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    prisma.syncCheckpoint.findMany({ orderBy: [{ entity: "asc" }, { dataAreaId: "asc" }] }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-tight">Dynamics 365 integration</h1>
        <p className="mt-1 text-sm text-charcoal/60">
          Service principal credentials, entity names and the legal entities in scope.
          {settings.updatedBy ? ` Last changed by ${settings.updatedBy} on ${dateTime(settings.updatedAt)}.` : ""}
        </p>
      </div>

      <Panel title="Connection">
        <IntegrationForm
          values={{
            tenantId: settings.tenantId ?? "",
            clientId: settings.clientId ?? "",
            secretSet: !!settings.clientSecretEnc,
            resourceUrl: settings.resourceUrl ?? "",
            scopeOverride: settings.scopeOverride ?? "",
            vendorEntity: settings.vendorEntity,
            itemEntity: settings.itemEntity,
            tradeAgreementEntity: settings.tradeAgreementEntity,
            pushEntity: settings.pushEntity,
            legalEntities: settings.legalEntities.join(", "),
            pageSize: settings.pageSize,
            incrementalEnabled: settings.incrementalEnabled,
            modifiedDateField: settings.modifiedDateField,
            itemFilter: settings.itemFilter ?? "",
            tradeAgreementFilter: settings.tradeAgreementFilter ?? "",
            timeBudgetSeconds: settings.timeBudgetSeconds,
            cronEnabled: settings.cronEnabled,
          }}
        />
      </Panel>

      {settings.timeBudgetSeconds >= 300 ? (
        <p className="border border-nude/40 bg-[#FBF0E8] px-4 py-3 text-sm text-nude">
          The time budget is {settings.timeBudgetSeconds} seconds, at or above the maximum a function is
          allowed to run. A budget that cannot be reached means the run is killed before it checkpoints.
          Set it below your plan&apos;s function limit, leaving room for the last page to finish writing.
        </p>
      ) : null}

      <Panel title="Manual refresh" subtitle="Same code path as the nightly job">
        <SyncControls legalEntities={settings.legalEntities} />
      </Panel>

      <Panel title="Sync position" subtitle="Where each entity got to, and what a daily run will pull">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Entity</th>
                <th className="th">Legal entity</th>
                <th className="th">State</th>
                <th className="th">Changed since</th>
                <th className="th">Last completed</th>
                <th className="th">Rows last run</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.length === 0 ? (
                <tr><td className="td text-charcoal/60" colSpan={6}>Nothing has run yet.</td></tr>
              ) : (
                checkpoints.map((c) => (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="td">{c.entity.replace(/_/g, " ")}</td>
                    <td className="td uppercase">{c.dataAreaId}</td>
                    <td className="td">
                      {c.nextLink ? (
                        <span className="badge border-nude/40 bg-[#FBF0E8] text-nude">Resumes next run</span>
                      ) : (
                        <span className="badge border-[#2C6B44]/25 bg-[#EAF4EE] text-[#2C6B44]">Complete</span>
                      )}
                    </td>
                    <td className="td text-xs">{c.watermark ? dateTime(c.watermark) : "Full pull"}</td>
                    <td className="td text-xs">{c.lastCompleted ? dateTime(c.lastCompleted) : "-"}</td>
                    <td className="td">{c.rowsLastRun}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Sync log">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Type</th>
                <th className="th">Trigger</th>
                <th className="th">Status</th>
                <th className="th">Processed</th>
                <th className="th">Failed</th>
                <th className="th">Complete</th>
                <th className="th">Started</th>
                <th className="th">Message</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr><td className="td text-charcoal/60" colSpan={8}>Nothing has run yet.</td></tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="td">{r.type.replace(/_/g, " ")}</td>
                    <td className="td">{r.trigger}</td>
                    <td className="td">{r.status}</td>
                    <td className="td">{r.processed}</td>
                    <td className="td">{r.failed}</td>
                    <td className="td text-xs">{r.incomplete ? "Paused" : "Yes"}</td>
                    <td className="td whitespace-nowrap text-xs">{dateTime(r.startedAt)}</td>
                    <td className="td max-w-[380px] text-xs text-charcoal/70">{r.message ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
