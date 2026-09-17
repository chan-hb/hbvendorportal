import { prisma } from "@/lib/prisma";

export type CheckpointEntity = "ITEMS" | "TRADE_AGREEMENTS" | "VENDORS";

export async function getCheckpoint(entity: CheckpointEntity, dataAreaId: string) {
  return prisma.syncCheckpoint.upsert({
    where: { entity_dataAreaId: { entity, dataAreaId } },
    create: { entity, dataAreaId },
    update: {},
  });
}

/** Stores the nextLink so the following invocation carries on where this stopped. */
export async function saveResumePoint(
  entity: CheckpointEntity,
  dataAreaId: string,
  nextLink: string | null,
  rows: number,
) {
  return prisma.syncCheckpoint.update({
    where: { entity_dataAreaId: { entity, dataAreaId } },
    data: { nextLink, rowsLastRun: rows },
  });
}

/**
 * Marks a clean finish. The watermark is the time the pull *started*, not
 * finished, so rows modified while it was running are picked up next time
 * rather than being skipped.
 */
export async function completeCheckpoint(
  entity: CheckpointEntity,
  dataAreaId: string,
  startedAt: Date,
  rows: number,
) {
  return prisma.syncCheckpoint.update({
    where: { entity_dataAreaId: { entity, dataAreaId } },
    data: { nextLink: null, watermark: startedAt, lastCompleted: new Date(), rowsLastRun: rows },
  });
}

export async function resetCheckpoint(entity: CheckpointEntity, dataAreaId: string) {
  return prisma.syncCheckpoint.update({
    where: { entity_dataAreaId: { entity, dataAreaId } },
    data: { nextLink: null, watermark: null },
  });
}

/**
 * Builds the OData filter for one legal entity, adding an incremental clause
 * when there is a watermark to work from and a free text clause from settings.
 */
export function buildFilter(opts: {
  dataAreaId: string;
  watermark?: Date | null;
  modifiedDateField: string;
  extraFilter?: string | null;
  fullRefresh: boolean;
}): string {
  const clauses = [`dataAreaId eq '${opts.dataAreaId}'`];

  if (!opts.fullRefresh && opts.watermark) {
    // A small overlap absorbs clock skew between the two systems.
    const from = new Date(opts.watermark.getTime() - 15 * 60 * 1000).toISOString();
    clauses.push(`${opts.modifiedDateField} ge ${from}`);
  }

  if (opts.extraFilter?.trim()) clauses.push(`(${opts.extraFilter.trim()})`);

  return clauses.join(" and ");
}

/**
 * Marks abandoned runs as failed.
 *
 * A sync row is created as RUNNING and only ever updated at the end. If the
 * platform kills the function first, which is what a timeout looks like, the
 * row stays RUNNING for ever and the log becomes unreadable. Anything that has
 * not touched its heartbeat recently was killed, so it is closed out here.
 *
 * Called at the start of every sync and whenever the integration page loads.
 */
export async function reapStaleRuns(staleAfterMinutes = 10): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60_000);

  const { count } = await prisma.syncRun.updateMany({
    where: {
      status: "RUNNING",
      OR: [
        { heartbeatAt: { lt: cutoff } },
        { heartbeatAt: null, startedAt: { lt: cutoff } },
      ],
    },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      incomplete: true,
      message:
        "The run stopped without finishing, which almost always means the function hit its time limit. Any pages already written are kept, and the next run carries on from the last checkpoint.",
    },
  });

  return count;
}

/** Records progress so the reaper can tell a live run from a dead one. */
export async function heartbeat(runId: string, processed: number) {
  await prisma.syncRun
    .update({ where: { id: runId }, data: { processed, heartbeatAt: new Date() } })
    .catch(() => {});
}

/** Simple wall clock budget so a run stops cleanly rather than being killed. */
export class TimeBudget {
  private readonly deadline: number;

  constructor(seconds: number) {
    this.deadline = Date.now() + seconds * 1000;
  }

  get exhausted(): boolean {
    return Date.now() >= this.deadline;
  }

  get remainingSeconds(): number {
    return Math.max(0, Math.round((this.deadline - Date.now()) / 1000));
  }
}
