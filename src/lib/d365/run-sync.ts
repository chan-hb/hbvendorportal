import { syncVendors } from "./sync-vendors";
import { syncItems } from "./sync-items";
import { syncTradeAgreements } from "./sync-trade-agreements";
import { pushApprovedAgreements } from "./push-approved";

export type SyncScope = "vendors" | "items" | "tradeAgreements" | "push" | "all";

export type RunOptions = {
  /** Ignore the incremental watermark and read the entity in full. */
  fullRefresh?: boolean;
  /** Restrict to one legal entity, to spread a large pull over invocations. */
  onlyDataAreaId?: string;
};

/** One entry point shared by the manual refresh button and the daily cron. */
export async function runSync(
  scope: SyncScope,
  trigger: "manual" | "cron",
  triggeredBy?: string,
  options: RunOptions = {},
) {
  const results: Record<string, unknown> = {};
  // Vendors first. Items resolve their default vendor against this table.
  if (scope === "vendors" || scope === "all") results.vendors = await syncVendors(trigger, triggeredBy);
  if (scope === "items" || scope === "all") results.items = await syncItems(trigger, triggeredBy, options);
  if (scope === "tradeAgreements" || scope === "all")
    results.tradeAgreements = await syncTradeAgreements(trigger, triggeredBy, options);
  if (scope === "push" || scope === "all") results.push = await pushApprovedAgreements(trigger, triggeredBy);
  return results;
}
