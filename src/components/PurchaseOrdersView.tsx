"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PoView, PurchaseOrderData } from "@/lib/purchase-orders";
import { PoLoadingVisual } from "@/components/PoLoadingVisual";
import { QuantityOverTime, SkuDelivery, qty } from "@/components/PoCharts";

export type RefreshState = {
  status: string;
  stage: string | null;
  startedAt: string | null;
  lastSuccessAt: string | null;
  orderCount: number;
  lineCount: number;
  error: string | null;
};

const POLL_MS = 1500;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Open", className: "state-pending" },
  RECEIVED: { label: "Received", className: "state-waiting" },
  INVOICED: { label: "Invoiced", className: "state-done" },
  CANCELLED: { label: "Cancelled", className: "state-quiet" },
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function sinceLabel(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function PurchaseOrdersView({ data, initial }: { data: PurchaseOrderData; initial: RefreshState }) {
  const router = useRouter();
  const [state, setState] = useState<RefreshState>(initial);
  // Until the first status check returns we do not know whether the data on
  // screen is current, so a vendor with nothing stored yet sees the loader.
  const [checked, setChecked] = useState(false);
  const wasRunning = useRef(initial.status === "RUNNING");

  const apply = useCallback(
    (next: RefreshState) => {
      setState(next);
      if (next.status === "RUNNING") wasRunning.current = true;
      // Finished since we started watching: re-render the server component
      // so the tables and charts pick up the new rows.
      if (wasRunning.current && next.status !== "RUNNING") {
        wasRunning.current = false;
        router.refresh();
      }
    },
    [router],
  );

  const trigger = useCallback(
    async (force = false) => {
      try {
        const res = await fetch(`/api/purchase-orders/refresh${force ? "?force=1" : ""}`, { method: "POST" });
        if (res.ok) apply(await res.json());
      } finally {
        setChecked(true);
      }
    },
    [apply],
  );

  // Opening the page asks for a refresh. The server skips it when sign-in has
  // already refreshed in the last fifteen minutes, or when one is running.
  useEffect(() => {
    void trigger(false);
  }, [trigger]);

  useEffect(() => {
    if (state.status !== "RUNNING") return;
    const id = setInterval(async () => {
      const res = await fetch("/api/purchase-orders/refresh", { cache: "no-store" });
      if (res.ok) apply(await res.json());
    }, POLL_MS);
    return () => clearInterval(id);
  }, [state.status, apply]);

  const refreshing = state.status === "RUNNING" || (!checked && !data.hasData);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Orders</p>
          <h1 className="page-title mt-2">Purchase orders</h1>
          <p className="mt-1 text-sm text-charcoal/60">
            Your purchase orders from Huda Beauty over the last two years, refreshed from Dynamics 365 each time you
            sign in.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-charcoal/55">Updated {sinceLabel(state.lastSuccessAt)}</p>
          <button type="button" className="btn-ghost" disabled={refreshing} onClick={() => void trigger(true)}>
            {refreshing ? "Refreshing" : "Refresh now"}
          </button>
        </div>
      </div>

      {state.status === "FAILED" ? (
        <p className="alert-error">
          The last refresh from Dynamics 365 did not complete
          {data.hasData ? ", so what you see below may be out of date" : ""}. Try again in a few minutes, and contact
          your Huda Beauty buyer if it keeps happening.
        </p>
      ) : null}

      {refreshing ? (
        <PoLoadingVisual stage={state.stage} startedAt={state.startedAt} />
      ) : !data.hasData ? (
        <section className="panel px-5 py-16 text-center">
          <p className="font-display text-xl font-black uppercase tracking-[-0.01em] text-charcoal">
            No purchase orders yet
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal/60">
            Nothing has been ordered from you in the last two years. Orders appear here once Huda Beauty raises them.
          </p>
        </section>
      ) : (
        <Loaded data={data} />
      )}
    </div>
  );
}

function Loaded({ data }: { data: PurchaseOrderData }) {
  const { kpis } = data;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Open orders" value={String(kpis.openOrders)} note="Not yet fully received" />
        <Kpi label="Quantity outstanding" value={qty(kpis.outstandingQty)} note="Still to deliver on open orders" />
        <Kpi label="Delivered, last 12 months" value={qty(kpis.deliveredLast12)} note="Units received by Huda Beauty" />
        <Kpi
          label="Fill rate"
          value={kpis.fillRate === null ? "-" : `${(kpis.fillRate * 100).toFixed(1)}%`}
          note="Delivered against ordered, completed orders"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="panel xl:col-span-2">
          <header className="border-b border-line px-5 py-4">
            <h2 className="section-title">Quantity delivered over time</h2>
            <p className="mt-1 text-xs text-charcoal/60">Hover a month for the figures.</p>
          </header>
          <QuantityOverTime data={data.monthly} />
        </section>
        <section className="panel">
          <header className="border-b border-line px-5 py-4">
            <h2 className="section-title">Delivery by SKU</h2>
            <p className="mt-1 text-xs text-charcoal/60">Your top SKUs by quantity delivered.</p>
          </header>
          <SkuDelivery data={data.topSkus} />
        </section>
      </div>

      <OrdersTable
        title="Open purchase orders"
        subtitle="Orders still awaiting delivery in full. Select an order to see its lines."
        orders={data.openOrders}
        empty="No open purchase orders right now."
      />
      <OrdersTable
        title="Last 10 purchase orders"
        subtitle="Your most recent orders, whatever their status."
        orders={data.recentOrders}
        empty="No purchase orders in the last two years."
        showStatus
      />
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel px-5 py-4">
      <p className="font-headline text-[10px] font-bold uppercase tracking-[0.16em] text-charcoal/60">{label}</p>
      <p className="mt-2 font-display text-3xl font-black tabular-nums text-charcoal">{value}</p>
      <p className="mt-1 text-xs text-charcoal/55">{note}</p>
    </div>
  );
}

function OrdersTable({
  title,
  subtitle,
  orders,
  empty,
  showStatus = false,
}: {
  title: string;
  subtitle: string;
  orders: PoView[];
  empty: string;
  showStatus?: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="panel">
      <header className="border-b border-line px-5 py-4">
        <h2 className="section-title">{title}</h2>
        <p className="mt-1 text-xs text-charcoal/60">{subtitle}</p>
      </header>
      {orders.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-charcoal/60">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Purchase order</th>
                <th className="th">Order date</th>
                <th className="th">Entity</th>
                {showStatus ? <th className="th">Status</th> : null}
                <th className="th text-right">Lines</th>
                <th className="th text-right">Qty ordered</th>
                <th className="th text-right">Qty delivered</th>
                <th className="th">Progress</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const expanded = open.has(o.key);
                const pct = o.orderedQty > 0 ? Math.min(100, (o.deliveredQty / o.orderedQty) * 100) : 0;
                const badge = STATUS_BADGE[o.status] ?? STATUS_BADGE.OPEN;
                return (
                  <Fragment key={o.key}>
                    <tr
                      className="cursor-pointer border-b border-line/60 transition hover:bg-blush/60"
                      onClick={() => toggle(o.key)}
                    >
                      <td className="td">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 font-medium"
                          aria-expanded={expanded}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(o.key);
                          }}
                        >
                          <span className={`text-pink transition ${expanded ? "rotate-90" : ""}`} aria-hidden>
                            ›
                          </span>
                          {o.purchaseOrderNumber}
                        </button>
                      </td>
                      <td className="td whitespace-nowrap">{shortDate(o.orderDate)}</td>
                      <td className="td uppercase">{o.dataAreaId}</td>
                      {showStatus ? (
                        <td className="td">
                          <span className={`badge ${badge.className}`}>{badge.label}</span>
                        </td>
                      ) : null}
                      <td className="td text-right tabular-nums">{o.lines.length}</td>
                      <td className="td text-right tabular-nums">{qty(o.orderedQty)}</td>
                      <td className="td text-right tabular-nums">{qty(o.deliveredQty)}</td>
                      <td className="td min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-[4px] bg-[#EBE3F4]">
                            <div className="h-full rounded-[4px] bg-pink" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums text-charcoal/60">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="border-b border-line/60 bg-cloud/30">
                        <td colSpan={showStatus ? 8 : 7} className="px-4 py-3">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr>
                                <th className="th py-2">SKU</th>
                                <th className="th py-2">Name</th>
                                <th className="th py-2 text-right">Qty</th>
                                <th className="th py-2 text-right">Delivered</th>
                                <th className="th py-2 text-right">Outstanding</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.lines.map((l, i) => (
                                <tr key={`${l.itemNumber}-${i}`} className="border-t border-line/60">
                                  <td className="td py-2 font-medium">{l.itemNumber}</td>
                                  <td className="td py-2 text-charcoal/70">{l.itemName ?? "-"}</td>
                                  <td className="td py-2 text-right tabular-nums">{qty(l.orderedQty)}</td>
                                  <td className="td py-2 text-right tabular-nums">{qty(l.deliveredQty)}</td>
                                  <td className="td py-2 text-right tabular-nums">
                                    {qty(Math.max(0, l.orderedQty - l.deliveredQty))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
