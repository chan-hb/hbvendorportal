"use client";

import { useMemo, useState } from "react";
import type { MonthPoint, SkuPoint } from "@/lib/purchase-orders";

/**
 * Hand-drawn SVG rather than a chart library: two charts do not justify a
 * dependency, and this keeps the brand palette and type exact.
 *
 * Colours were checked with a colour-blind separation validator: Power Pink for
 * delivered, violet for ordered. Both series are always labelled in the
 * legend and tooltip, so colour is never the only cue.
 */
export const DELIVERED = "#ED3B86";
export const ORDERED = "#7B4FB0";

export function qty(n: number) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n);
}

function compact(n: number) {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function monthLabel(key: string, withYear = true) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    ...(withYear ? { year: "2-digit" } : {}),
    timeZone: "UTC",
  });
}

/** A rounded-top bar anchored square to the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function niceMax(v: number) {
  if (v <= 0) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-charcoal/70">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ORDERED }} /> Ordered
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: DELIVERED }} /> Delivered
      </span>
    </div>
  );
}

export function QuantityOverTime({ data }: { data: MonthPoint[] }) {
  const [range, setRange] = useState<12 | 24>(12);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const points = useMemo(() => data.slice(-range), [data, range]);

  const W = 800;
  const H = 260;
  const pad = { top: 16, right: 8, bottom: 28, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.ordered, p.delivered)), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const slot = innerW / points.length;
  const barW = Math.max(3, Math.min(18, (slot - 6) / 2));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const labelEvery = range === 24 ? 3 : 1;

  const totalDelivered = points.reduce((t, p) => t + p.delivered, 0);
  const totalOrdered = points.reduce((t, p) => t + p.ordered, 0);
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2">
          <button type="button" className={range === 12 ? "chip-active" : "chip"} onClick={() => setRange(12)}>
            12 months
          </button>
          <button type="button" className={range === 24 ? "chip-active" : "chip"} onClick={() => setRange(24)}>
            24 months
          </button>
        </div>
        <div className="flex items-center gap-4">
          <Legend />
          <button
            type="button"
            className="text-xs font-semibold text-charcoal/60 underline-offset-2 hover:text-pink hover:underline"
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? "Show chart" : "Show as table"}
          </button>
        </div>
      </div>

      <p className="px-5 pt-3 text-xs text-charcoal/60">
        <span className="font-semibold text-charcoal">{qty(totalDelivered)}</span> delivered against{" "}
        <span className="font-semibold text-charcoal">{qty(totalOrdered)}</span> ordered in the last {range} months.
        Ordered is counted in the month of the order, delivered in the month it was received.
      </p>

      {asTable ? (
        <div className="max-h-80 overflow-auto px-5 py-4">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Month</th>
                <th className="th text-right">Ordered</th>
                <th className="th text-right">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.month} className="border-b border-line/60 last:border-0">
                  <td className="td py-2">{monthLabel(p.month)}</td>
                  <td className="td py-2 text-right tabular-nums">{qty(p.ordered)}</td>
                  <td className="td py-2 text-right tabular-nums">{qty(p.delivered)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative px-3 pb-4 pt-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Ordered and delivered quantity by month over the last ${range} months`}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={W - pad.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="#E9E2E6"
                  strokeWidth={1}
                  strokeDasharray={t === 0 ? undefined : "2 4"}
                />
                <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#45404199">
                  {compact(t)}
                </text>
              </g>
            ))}

            {points.map((p, i) => {
              const x0 = pad.left + i * slot + (slot - (barW * 2 + 2)) / 2;
              const active = hover === i;
              return (
                <g key={p.month}>
                  {active ? (
                    <rect x={pad.left + i * slot} y={pad.top} width={slot} height={innerH} fill="#FDF4F8" />
                  ) : null}
                  <path
                    d={barPath(x0, y(p.ordered), barW, y(0) - y(p.ordered))}
                    fill={ORDERED}
                    opacity={hover === null || active ? 1 : 0.45}
                  />
                  <path
                    d={barPath(x0 + barW + 2, y(p.delivered), barW, y(0) - y(p.delivered))}
                    fill={DELIVERED}
                    opacity={hover === null || active ? 1 : 0.45}
                  />
                  {i % labelEvery === 0 || i === points.length - 1 ? (
                    <text
                      x={pad.left + i * slot + slot / 2}
                      y={H - 8}
                      textAnchor="middle"
                      fontSize={11}
                      fill={active ? "#454041" : "#45404199"}
                    >
                      {monthLabel(p.month, range === 24 || i === 0 || p.month.endsWith("-01"))}
                    </text>
                  ) : null}
                  {/* Hit target spans the full column, much larger than the bars. */}
                  <rect
                    x={pad.left + i * slot}
                    y={pad.top}
                    width={slot}
                    height={innerH + pad.bottom}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onTouchStart={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>

          {hovered && hover !== null ? (
            <div
              className="pointer-events-none absolute top-2 z-10 min-w-[150px] -translate-x-1/2 rounded-field border border-line bg-white px-3 py-2 text-xs shadow-lg"
              style={{
                left: `clamp(80px, ${((pad.left + hover * slot + slot / 2) / W) * 100}%, calc(100% - 80px))`,
              }}
            >
              <p className="font-headline text-[10px] font-bold uppercase tracking-[0.14em] text-charcoal/60">
                {monthLabel(hovered.month)}
              </p>
              <p className="mt-1 flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: ORDERED }} />
                  Ordered
                </span>
                <span className="font-semibold tabular-nums">{qty(hovered.ordered)}</span>
              </p>
              <p className="mt-0.5 flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: DELIVERED }} />
                  Delivered
                </span>
                <span className="font-semibold tabular-nums">{qty(hovered.delivered)}</span>
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Delivered against ordered per SKU, as a meter: the pale track is what was
 * ordered, the fill is what has been delivered of it.
 */
export function SkuDelivery({ data }: { data: SkuPoint[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => Math.max(d.ordered, d.delivered)), 1);

  return (
    <div className="space-y-3 px-5 py-4">
      {data.map((s) => {
        const pct = s.ordered > 0 ? Math.min(100, (s.delivered / s.ordered) * 100) : 0;
        const active = hover === s.itemNumber;
        return (
          <div
            key={s.itemNumber}
            className={`rounded-field px-2 py-1.5 transition ${active ? "bg-blush" : ""}`}
            onMouseEnter={() => setHover(s.itemNumber)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <p className="min-w-0 truncate">
                <span className="font-semibold text-charcoal">{s.itemNumber}</span>
                {s.itemName ? <span className="text-charcoal/55"> . {s.itemName}</span> : null}
              </p>
              <p className="shrink-0 tabular-nums text-charcoal/70">
                <span className="font-semibold text-charcoal">{qty(s.delivered)}</span> / {qty(s.ordered)}
                {active ? <span className="ml-2 text-charcoal/55">{pct.toFixed(0)}% delivered</span> : null}
              </p>
            </div>
            <div className="mt-1.5 h-2.5 w-full">
              <div
                className="relative h-full rounded-[4px]"
                style={{ width: `${(s.ordered / max) * 100}%`, background: "#EBE3F4", minWidth: 4 }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-[4px]"
                  style={{ width: `${pct}%`, background: DELIVERED }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 pt-1 text-xs text-charcoal/60">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "#EBE3F4" }} /> Ordered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: DELIVERED }} /> Delivered
        </span>
      </div>
    </div>
  );
}
