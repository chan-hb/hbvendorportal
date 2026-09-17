import { prisma } from "@/lib/prisma";
import { getD365Config } from "./config";
import { odataPages } from "./client";
import { mapTradeAgreement, type Row } from "./mappers";
import { bulkUpsertTradeAgreements, type TradeAgreementUpsertRow } from "./bulk";
import {
  TimeBudget,
  buildFilter,
  completeCheckpoint,
  getCheckpoint,
  heartbeat,
  reapStaleRuns,
  saveResumePoint,
} from "./checkpoint";
import { finish, legalEntitiesOf, type SyncOptions } from "./sync-items";

/**
 * Pulls current trade agreements. Same streaming, batching and checkpointing
 * as the item sync, because this entity grows with the item master.
 */
export async function syncTradeAgreements(
  trigger: "manual" | "cron",
  triggeredBy?: string,
  options: SyncOptions = {},
) {
  const cfg = await getD365Config();
  const budget = new TimeBudget(cfg.timeBudgetSeconds);
  // Close out anything a previous timeout left marked as running.
  await reapStaleRuns();
  const run = await prisma.syncRun.create({ data: { type: "TRADE_AGREEMENTS", trigger, triggeredBy } });

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
      const checkpoint = await getCheckpoint("TRADE_AGREEMENTS", dataAreaId);
      if (checkpoint.nextLink) resumed = true;

      const filter = buildFilter({
        dataAreaId,
        watermark: checkpoint.watermark,
        modifiedDateField: cfg.modifiedDateField,
        extraFilter: cfg.tradeAgreementFilter,
        fullRefresh: options.fullRefresh || !cfg.incrementalEnabled,
      });

      let entityRows = 0;
      let stoppedEarly = false;

      for await (const page of odataPages<Row>(
        cfg,
        cfg.tradeAgreementEntity,
        { filter, crossCompany: true },
        checkpoint.nextLink,
      )) {
        const batch: TradeAgreementUpsertRow[] = [];

        for (const row of page.rows) {
          const ta = mapTradeAgreement(row);
          if (!ta) continue;
          // The item and vendor links are resolved by join during the upsert.
          batch.push(ta);
        }

        if (batch.length) {
          await bulkUpsertTradeAgreements(batch);
          entityRows += batch.length;
          processed += batch.length;
        }

        // Checkpoint after every page, not just when the budget runs out.
        // A platform timeout kills the function without warning, so a resume
        // point that is only written on a clean stop is never written at all,
        // and the run restarts from page one for ever.
        if (page.nextLink) {
          await saveResumePoint("TRADE_AGREEMENTS", dataAreaId, page.nextLink, entityRows);
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
        await completeCheckpoint("TRADE_AGREEMENTS", dataAreaId, startedAt, entityRows);
      }
    } catch (err) {
      failed += 1;
      problems.push(`${dataAreaId}: ${(err as Error).message}`);
    }
  }

  return finish(run.id, processed, failed, problems, { incomplete, resumed });
}

/** The price currently in force for an item, used as approver context. */
export async function currentPriceFor(dataAreaId: string, itemNumber: string, vendorCode?: string) {
  const now = new Date();
  return prisma.tradeAgreement.findFirst({
    where: {
      dataAreaId,
      itemNumber,
      ...(vendorCode ? { vendorCode } : {}),
      OR: [{ fromDate: null }, { fromDate: { lte: now } }],
      AND: [{ OR: [{ toDate: null }, { toDate: { gte: now } }] }],
    },
    orderBy: { fromDate: "desc" },
  });
}
