"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { FailureGroup, FailureSource, Leader, SyncRunPoint } from "@/lib/analytics";
import {
  AXIS_TEXT,
  Empty,
  GRID,
  INK,
  Legend,
  PINK,
  SERIES,
  STATUS,
  TableToggle,
  Tip,
  TipRow,
  TipTitle,
  dayTime,
  num,
  shortDay,
  useChartWidth,
  useMounted,
} from "./kit";

const LANES: { type: string; label: string }[] = [
  { type: "VENDORS", label: "Vendors" },
  { type: "ITEMS", label: "Items" },
  { type: "TRADE_AGREEMENTS", label: "Trade agreements" },
  { type: "PUSH_APPROVED", label: "Approved prices out" },
  { type: "CONNECTION_TEST", label: "Connection tests" },
];

function duration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function StatusLabel({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: s.color }}
        aria-hidden
      >
        {s.icon}
      </span>
      {s.label}
    </span>
  );
}

// ------------------------------------------------------------- swimlanes

/** Every sync run as a block on its own lane, coloured by outcome. */
export function SyncSwimlanes({ runs, since, now }: { runs: SyncRunPoint[]; since: number; now: number }) {
  const mounted = useMounted();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const [box, W] = useChartWidth<HTMLDivElement>(1100);

  const lanes = useMemo(() => {
    const known = new Set(LANES.map((l) => l.type));
    const extra = [...new Set(runs.map((r) => r.type))].filter((t) => !known.has(t)).map((t) => ({ type: t, label: t }));
    return [...LANES, ...extra]
      .map((l) => {
        const lr = runs.filter((r) => r.type === l.type);
        const done = lr.filter((r) => r.status !== "RUNNING");
        const ok = done.filter((r) => r.status === "SUCCESS").length;
        return { ...l, runs: lr, okRate: done.length ? (ok / done.length) * 100 : null };
      })
      .filter((l) => l.runs.length > 0);
  }, [runs]);

  if (lanes.length === 0) return <Empty>No syncs ran in this period.</Empty>;

  const labelW = 170;
  const laneH = 40;
  const top = 6;
  const H = top + lanes.length * laneH + 26;
  const x = (t: number) => labelW + ((t - since) / Math.max(1, now - since)) * (W - labelW - 12);
  const ticks = Array.from({ length: 5 }, (_, i) => since + ((now - since) * i) / 4);
  const isProblem = (r: SyncRunPoint) => r.status !== "SUCCESS" && r.status !== "RUNNING";
  const hovered = runs.find((r) => r.id === hover) ?? null;
  const hoveredLane = hovered ? lanes.findIndex((l) => l.type === hovered.type) : -1;

  // Runs are often a pixel wide, so hovering finds the nearest run on the lane
  // under the pointer rather than needing a direct hit.
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    const vy = ((e.clientY - box.top) / box.height) * H;
    const li = Math.floor((vy - top) / laneH);
    if (li < 0 || li >= lanes.length || vx < labelW - 4) return setHover(null);
    let best: SyncRunPoint | null = null;
    let bestD = 12;
    for (const r of lanes[li].runs) {
      if (problemsOnly && !isProblem(r)) continue;
      const x0 = x(r.start);
      const x1 = Math.max(x0 + 4, x(r.end ?? now));
      const d = vx < x0 ? x0 - vx : vx > x1 ? vx - x1 : 0;
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    setHover(best?.id ?? null);
  };

  const problems = runs.filter(isProblem).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="flex items-center gap-2">
          <button type="button" className={!problemsOnly ? "chip-active" : "chip"} onClick={() => setProblemsOnly(false)}>
            All runs <span className="ml-1 tabular-nums opacity-70">{runs.length}</span>
          </button>
          <button type="button" className={problemsOnly ? "chip-active" : "chip"} onClick={() => setProblemsOnly(true)}>
            Problems only <span className="ml-1 tabular-nums opacity-70">{problems}</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-charcoal/70">
          {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => (
            <StatusLabel key={k} status={k} />
          ))}
          <TableToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
        </div>
      </div>

      {asTable ? (
        <div className="max-h-96 overflow-auto px-5 py-4">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Started</th>
                <th className="th">Sync</th>
                <th className="th">Outcome</th>
                <th className="th text-right">Took</th>
                <th className="th text-right">Processed</th>
                <th className="th text-right">Failed</th>
                <th className="th">Message</th>
              </tr>
            </thead>
            <tbody>
              {[...runs]
                .filter((r) => !problemsOnly || isProblem(r))
                .reverse()
                .slice(0, 200)
                .map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="td whitespace-nowrap py-2 text-xs">{dayTime(r.start)}</td>
                    <td className="td py-2 text-xs">{LANES.find((l) => l.type === r.type)?.label ?? r.type}</td>
                    <td className="td whitespace-nowrap py-2 text-xs">
                      <StatusLabel status={r.status} />
                    </td>
                    <td className="td py-2 text-right text-xs tabular-nums">{r.end ? duration(r.end - r.start) : "–"}</td>
                    <td className="td py-2 text-right text-xs tabular-nums">{num(r.processed)}</td>
                    <td className="td py-2 text-right text-xs tabular-nums">{num(r.failed)}</td>
                    <td className="td max-w-[280px] truncate py-2 text-xs text-charcoal/70" title={r.message ?? ""}>
                      {r.message}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative pb-3 pt-2">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="Sync runs by type over time, coloured by outcome"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t, i) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={top} y2={top + lanes.length * laneH} stroke={GRID} strokeDasharray="2 4" />
                <text
                  x={x(t)}
                  y={H - 8}
                  textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
                  fontSize={11}
                  fill={AXIS_TEXT}
                >
                  {shortDay(t)}
                </text>
              </g>
            ))}
            {lanes.map((l, li) => {
              const cy = top + li * laneH + laneH / 2;
              return (
                <g key={l.type}>
                  <rect
                    x={labelW}
                    y={cy - 11}
                    width={W - labelW - 12}
                    height={22}
                    rx={6}
                    fill={hoveredLane === li ? "#FDF4F8" : "#F8F6F5"}
                  />
                  <text x={20} y={cy - 2} fontSize={12} fontWeight={700} fill={INK}>
                    {l.label}
                  </text>
                  <text x={20} y={cy + 13} fontSize={11} fill={AXIS_TEXT}>
                    {l.runs.length} runs{l.okRate !== null ? ` . ${num(l.okRate)}% ok` : ""}
                  </text>
                  {l.runs.map((r, ri) => {
                    const x0 = x(r.start);
                    const w = Math.max(4, x(r.end ?? now) - x0);
                    const dim = problemsOnly && !isProblem(r);
                    const active = hover === r.id;
                    return (
                      <rect
                        key={r.id}
                        x={x0}
                        y={cy - 8}
                        width={w}
                        height={16}
                        rx={3}
                        fill={STATUS[r.status].color}
                        stroke={active ? INK : "#fff"}
                        strokeWidth={active ? 1.5 : 1}
                        opacity={mounted ? (dim ? 0.12 : 1) : 0}
                        style={{ transition: `opacity 400ms ease-out ${Math.min(ri * 4, 500)}ms` }}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
          {hovered && hoveredLane >= 0 ? (
            <Tip left={(x(hovered.start) / W) * 100} top={`${((top + (hoveredLane + 1) * laneH) / H) * 100}%`}>
              <TipTitle>
                {LANES.find((l) => l.type === hovered.type)?.label ?? hovered.type} . {hovered.trigger}
              </TipTitle>
              <p className="mt-1 text-charcoal">
                <StatusLabel status={hovered.status} />
              </p>
              <TipRow label="Started" value={dayTime(hovered.start)} />
              <TipRow label="Took" value={hovered.end ? duration(hovered.end - hovered.start) : "Still running"} />
              <TipRow label="Processed" value={num(hovered.processed)} />
              {hovered.failed ? <TipRow label="Failed rows" value={num(hovered.failed)} /> : null}
              {hovered.message ? <p className="mt-1 line-clamp-3 text-charcoal/70">{hovered.message}</p> : null}
            </Tip>
          ) : null}
          <p className="px-2 pt-1 text-[11px] text-charcoal/55">Times are UTC. Hover a lane to inspect the nearest run.</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------- failure breakdown

/** The same fault happening fifty times reads as one long bar, not fifty rows. */
export function FailureBreakdown({ groups }: { groups: FailureGroup[] }) {
  const mounted = useMounted();
  const [source, setSource] = useState<FailureSource | "all">("all");
  const [open, setOpen] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0CA30C] text-lg font-bold text-white">
          {"✓"}
        </p>
        <p className="mt-3 text-sm text-charcoal/70">No failures in this period, and nothing waiting to be fixed.</p>
      </div>
    );
  }

  const sources = [...new Set(groups.map((g) => g.source))];
  const shown = groups.filter((g) => source === "all" || g.source === source).slice(0, 15);
  const max = Math.max(...shown.map((g) => g.count), 1);
  const total = (s: FailureSource | "all") =>
    groups.filter((g) => s === "all" || g.source === s).reduce((t, g) => t + g.count, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <button type="button" className={source === "all" ? "chip-active" : "chip"} onClick={() => setSource("all")}>
          All <span className="ml-1 tabular-nums opacity-70">{total("all")}</span>
        </button>
        {sources.map((s) => (
          <button key={s} type="button" className={source === s ? "chip-active" : "chip"} onClick={() => setSource(s)}>
            {s} <span className="ml-1 tabular-nums opacity-70">{total(s)}</span>
          </button>
        ))}
      </div>
      <ul className="space-y-1 px-3 py-4">
        {shown.map((g, i) => {
          const expanded = open === g.key;
          return (
            <li key={g.key} className={`rounded-field transition ${expanded ? "bg-blush" : "hover:bg-blush/70"}`}>
              <button
                type="button"
                className="grid w-full grid-cols-[1fr_64px] items-center gap-3 px-3 py-2.5 text-left"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : g.key)}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[11px]">
                    <span className="badge state-quiet">{g.source}</span>
                    <span className="text-charcoal/60">{g.detail}</span>
                    <span className="ml-auto whitespace-nowrap text-charcoal/50">last {dayTime(g.lastSeen)}</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-charcoal">{g.pattern}</span>
                  <span className="mt-1.5 block h-2 w-full rounded-[4px] bg-[#F8F6F5]">
                    <span
                      className="block h-full rounded-[4px] transition-[width] duration-700 ease-out motion-reduce:transition-none"
                      style={{
                        width: mounted ? `${Math.max(2, (g.count / max) * 100)}%` : "0%",
                        background: STATUS.FAILED.color,
                        transitionDelay: `${i * 50}ms`,
                      }}
                    />
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-xl font-black tabular-nums leading-none text-vanta">
                    {g.count}
                  </span>
                  <span className="text-[10px] text-charcoal/55">{g.count === 1 ? "time" : "times"}</span>
                </span>
              </button>
              {expanded ? (
                <div className="px-3 pb-3">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-field border border-line bg-white p-3 text-[11px] text-charcoal/80">
                    {g.sample}
                  </pre>
                  <Link href={g.href} className="mt-2 inline-block text-xs font-semibold text-pink hover:underline">
                    Go to where this is fixed
                  </Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ leaderboard

function Sparkline({ values }: { values: number[] }) {
  const W = 84;
  const H = 24;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (W - 4) + 2, H - 3 - (v / max) * (H - 6)]);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className="shrink-0">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={PINK} />
    </svg>
  );
}

/** Ranked by total actions; the bar splits that total into its kinds of activity. */
export function Leaderboard({ rows, parts, empty }: { rows: Leader[]; parts: string[]; empty: string }) {
  const mounted = useMounted();
  const [hover, setHover] = useState<string | null>(null);
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = rows[0].total;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <Legend items={parts.map((p, i) => ({ label: p, color: SERIES[i] }))} />
        <span className="text-[11px] text-charcoal/55">Trend across the period</span>
      </div>
      <ol className="space-y-1 px-3 py-4">
        {rows.map((r, i) => {
          const active = hover === r.id;
          return (
            <li
              key={r.id}
              className={`grid grid-cols-[28px_minmax(0,150px)_1fr_40px_84px] items-center gap-3 rounded-field px-2 py-2 transition ${
                active ? "bg-blush" : ""
              }`}
              onMouseEnter={() => setHover(r.id)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                  i < 3 ? "bg-pink text-white" : "bg-cloud text-charcoal"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-charcoal">{r.name}</span>
                {r.sub ? <span className="block truncate text-[11px] text-charcoal/55">{r.sub}</span> : null}
              </span>
              <span className="min-w-0">
                <span
                  className="flex h-3 gap-[2px] transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: mounted ? `${Math.max(3, (r.total / max) * 100)}%` : "0%", transitionDelay: `${i * 60}ms` }}
                >
                  {r.parts.map((v, pi) =>
                    v > 0 ? (
                      <span
                        key={pi}
                        className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                        style={{ flexGrow: v, flexBasis: 0, background: SERIES[pi] }}
                      />
                    ) : null,
                  )}
                </span>
                <span className={`mt-1 block text-[11px] tabular-nums text-charcoal/60 ${active ? "" : "sr-only"}`}>
                  {r.parts.map((v, pi) => `${v} ${parts[pi].toLowerCase()}`).join(" . ")}
                </span>
              </span>
              <span className="text-right font-display text-lg font-black tabular-nums text-vanta">{r.total}</span>
              <Sparkline values={r.spark} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
