import { prisma } from "@/lib/prisma";
import { getD365Config } from "./config";
import { odataPages } from "./client";
import { mapItem, type Row } from "./mappers";
import { bulkUpsertItems, type ItemUpsertRow } from "./bulk";
import {
  TimeBudget,
  buildFilter,
  completeCheckpoint,
  getCheckpoint,
  heartbeat,
  reapStaleRuns,
  saveResumePoint,
} from "./checkpoint";

export type SyncOptions = {
  /** Ignore the watermark and pull everything. */
  fullRefresh?: boolean;
  /** Restrict to one legal entity. Used to spread a large pull over invocations. */
  onlyDataAreaId?: string;
};

/**
 * Pulls the item master.
 *
 * Built for large entity sets: pages are streamed rather than buffered, each
 * page is written with a single set based statement, and the run checkpoints
 * so a timeout resumes rather than starting over. Daily runs are incremental
 * against ModifiedDateTime, so only a full refresh ever reads everything.
 */
export async function syncItems(
  trigger: "manual" | "cron",
  triggeredBy?: string,
  options: SyncOptions = {},
) {
  const cfg = await getD365Config();
  const budget = new TimeBudget(cfg.timeBudgetSeconds);
  // Close out anything a previous timeout left marked as running.
  await reapStaleRuns();
  const run = await prisma.syncRun.create({ data: { type: "ITEMS", trigger, triggeredBy } });

  let processed = 0;
  let failed = 0;
  let incomplete = false;
  let resumed = false;
  const problems: string[] = [];

  const entities = legalEntitiesOf(cfg.legalEntities).filter(
    (code) => !options.onlyDataAreaId || code === options.onlyDataAreaId,
  );

  for (const dataAreaId of entities) {
    if (budget.exhausted) {
      incomplete = true;
      problems.push(`${dataAreaId}: not started, time budget spent`);
      continue;
    }

    const startedAt = new Date();

    try {
      const checkpoint = await getCheckpoint("ITEMS", dataAreaId);
      if (checkpoint.nextLink) resumed = true;

      const legalEntity = await prisma.legalEntity.findUnique({ where: { code: dataAreaId } });

      const filter = buildFilter({
        dataAreaId,
        watermark: checkpoint.watermark,
        modifiedDateField: cfg.modifiedDateField,
        extraFilter: cfg.itemFilter,
        fullRefresh: options.fullRefresh || !cfg.incrementalEnabled,
      });

      let entityRows = 0;
      let stoppedEarly = false;

      for await (const page of odataPages<Row>(
        cfg,
        cfg.itemEntity,
        { filter, crossCompany: true, orderby: "ItemNumber" },
        checkpoint.nextLink,
      )) {
        const batch: ItemUpsertRow[] = [];

        for (const row of page.rows) {
          const item = mapItem(row);
          if (!item) continue;
          // The default vendor column is the item-vendor relationship. It is
          // resolved to a vendor id in SQL during the upsert.
          batch.push({ ...item, legalEntityId: legalEntity?.id ?? null });
        }

        if (batch.length) {
          await bulkUpsertItems(batch);
          entityRows += batch.length;
          processed += batch.length;
        }

        // Checkpoint after every page, not just when the budget runs out.
        // A platform timeout kills the function without warning, so a resume
        // point that is only written on a clean stop is never written at all,
        // and the run restarts from page one for ever.
        if (page.nextLink) {
          await saveResumePoint("ITEMS", dataAreaId, page.nextLink, entityRows);
        }
        await heartbeat(run.id, processed);

        if (budget.exhausted && page.nextLink) {
          incomplete = true;
          stoppedEarly = true;
          problems.push(`${dataAreaId}: paused after ${entityRows} rows, resumes on the next run`);
          break;
        }
      }

      if (!stoppedEarly) {
        await completeCheckpoint("ITEMS", dataAreaId, startedAt, entityRows);
      }
    } catch (err) {
      failed += 1;
      problems.push(`${dataAreaId}: ${(err as Error).message}`);
    }
  }

  return finish(run.id, processed, failed, problems, { incomplete, resumed });
}

export function legalEntitiesOf(configured: string[]): string[] {
  return configured.map((c) => c.trim().toLowerCase()).filter(Boolean);
}

export async function finish(
  runId: string,
  processed: number,
  failed: number,
  problems: string[],
  flags: { incomplete?: boolean; resumed?: boolean } = {},
) {
  const status = failed === 0 ? (flags.incomplete ? "PARTIAL" : "SUCCESS") : processed > 0 ? "PARTIAL" : "FAILED";
  return prisma.syncRun.update({
    where: { id: runId },
    data: {
      status,
      processed,
      failed,
      incomplete: flags.incomplete ?? false,
      resumed: flags.resumed ?? false,
      finishedAt: new Date(),
      message: problems.length ? problems.join(" | ").slice(0, 2000) : null,
    },
  });
}
