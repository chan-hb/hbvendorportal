"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DecisionPoint, FunnelOutcome, FunnelStage, PricePoint } from "@/lib/analytics";
import {
  AXIS_TEXT,
  Empty,
  GRID,
  INK,
  Legend,
  PINK,
  TableToggle,
  Tip,
  TipRow,
  TipTitle,
  VIOLET,
  days,
  niceMax,
  useChartWidth,
  num,
  price,
  shortDay,
  signedPct,
  useMounted,
} from "./kit";

const STATUS_TEXT: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting decision",
  CHANGE_REQUESTED: "Change requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

// ------------------------------------------------------------------ funnel

/**
 * Where this period's submissions have got to. One hue: the stages are the
 * same measure, so colour would add nothing but noise. Every stage and outcome
 * opens the matching filtered list.
 */
export function ApprovalFunnel({ stages, outcomes }: { stages: FunnelStage[]; outcomes: FunnelOutcome[] }) {
  const mounted = useMounted();
  const top = stages[0]?.value ?? 0;
  if (top === 0) return <Empty>No agreements were submitted in this period.</Empty>;

  return (
    <div className="px-5 py-5">
      <ol>
        {stages.map((s, i) => {
          const pct = (s.value / top) * 100;
          const prev = i > 0 ? stages[i - 1].value : null;
          return (
            <li key={s.key}>
              {prev !== null ? (
                <p className="py-1 pl-[108px] text-[11px] tabular-nums text-charcoal/55" aria-hidden>
                  {"↓"} {prev > 0 ? `${num((s.value / prev) * 100)}%` : "–"}
                </p>
              ) : null}
              <Link
                href={s.href}
                className="group grid grid-cols-[96px_1fr_48px] items-center gap-3 rounded-field px-1 py-0.5 transition hover:bg-blush"
                aria-label={`${s.label}: ${s.value}`}
              >
                <span className="text-xs font-semibold text-charcoal">{s.label}</span>
                <span className="relative flex h-9 items-center justify-center">
                  <span
                    className="absolute inset-y-0 rounded-[6px] bg-pink transition-[width] duration-700 ease-out group-hover:bg-pink-600 motion-reduce:transition-none"
                    style={{ width: mounted ? `${Math.max(pct, 1.5)}%` : "0%", transitionDelay: `${i * 90}ms` }}
                  />
                </span>
                <span className="text-right font-display text-xl font-black tabular-nums text-vanta">{s.value}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4">
        {outcomes.map((o) => (
          <Link
            key={o.label}
            href={o.href}
            className="flex items-baseline justify-between gap-2 rounded-field border border-line px-3 py-2 text-xs transition hover:border-pink"
          >
            <span className="text-charcoal/70">{o.label}</span>
            <span className="font-semibold tabular-nums text-charcoal">{o.value}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------- time to decision

export function DecisionTime({ points, waitingDays }: { points: DecisionPoint[]; waitingDays: number }) {
  const mounted = useMounted();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const values = points.map((p) => p.median).filter((v): v is number => v !== null);
  const [box, W] = useChartWidth<HTMLDivElement>(560);
  const H = 240;
  const pad = { top: 18, right: 16, bottom: 28, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(waitingDays * 1.2, ...values));
  const x = (i: number) => pad.left + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const slot = innerW / Math.max(1, points.length - 1);

  // The line breaks over periods with no decisions rather than inventing a value.
  const { line, area } = useMemo(() => {
    let l = "";
    let a = "";
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length === 0) return;
      l += run.map(([px, py], j) => `${j ? "L" : "M"}${px},${py}`).join("");
      a += `M${run[0][0]},${y(0)}` + run.map(([px, py]) => `L${px},${py}`).join("") + `L${run[run.length - 1][0]},${y(0)}Z`;
      run = [];
    };
    points.forEach((p, i) => (p.median === null ? flush() : run.push([x(i), y(p.median)])));
    flush();
    return { line: l, area: a };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, max, W]);

  if (values.length === 0) return <Empty>No decisions were made in this period.</Empty>;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.ceil(points.length / 7);
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <Legend items={[{ label: "Median days to decide", color: PINK }]} />
        <TableToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-auto px-5 py-4">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Period</th>
                <th className="th text-right">Decisions</th>
                <th className="th text-right">Median</th>
                <th className="th">Slowest</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key} className="border-b border-line/60 last:border-0">
                  <td className="td py-2">{p.label}</td>
                  <td className="td py-2 text-right tabular-nums">{p.count}</td>
                  <td className="td py-2 text-right tabular-nums">{p.median === null ? "–" : days(p.median)}</td>
                  <td className="td py-2 text-xs">
                    {p.slowest ? (
                      <Link href={`/agreements/${p.slowest.id}`} className="text-pink hover:underline">
                        {p.slowest.reference} ({days(p.slowest.days)})
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative pb-3 pt-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="Median days from submission to decision, by period"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="dt-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={PINK} stopOpacity={0.18} />
                <stop offset="100%" stopColor={PINK} stopOpacity={0} />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeDasharray={t ? "2 4" : undefined} />
                <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                  {num(t, t < 10 && t % 1 ? 1 : 0)}d
                </text>
              </g>
            ))}
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={y(waitingDays)}
              y2={y(waitingDays)}
              stroke={INK}
              strokeOpacity={0.45}
              strokeDasharray="6 4"
            />
            <text x={W - pad.right} y={y(waitingDays) - 6} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
              {waitingDays} days
            </text>

            <path d={area} fill="url(#dt-fill)" opacity={mounted ? 1 : 0} className="transition-opacity duration-700" />
            <path
              d={line}
              fill="none"
              stroke={PINK}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={mounted ? 0 : 1}
              style={{ transition: "stroke-dashoffset 1100ms ease-out" }}
            />

            {hover !== null ? (
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke={INK} strokeOpacity={0.3} />
            ) : null}

            {points.map((p, i) => (
              <g key={p.key}>
                {p.median !== null ? (
                  <circle
                    cx={x(i)}
                    cy={y(p.median)}
                    r={hover === i ? 6 : 4}
                    fill={PINK}
                    stroke="#fff"
                    strokeWidth={2}
                    opacity={mounted ? 1 : 0}
                    style={{ transition: "opacity 400ms ease-out, r 150ms" }}
                  />
                ) : null}
                {i % labelEvery === 0 || i === points.length - 1 ? (
                  <text
                    x={x(i)}
                    y={H - 8}
                    textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                    fontSize={11}
                    fill={hover === i ? INK : AXIS_TEXT}
                  >
                    {p.label}
                  </text>
                ) : null}
                <rect
                  x={x(i) - slot / 2}
                  y={pad.top}
                  width={slot}
                  height={innerH + pad.bottom}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onTouchStart={() => setHover(i)}
                />
              </g>
            ))}
          </svg>
          {hovered && hover !== null ? (
            <Tip left={(x(hover) / W) * 100}>
              <TipTitle>{hovered.label}</TipTitle>
              <TipRow label="Median" value={hovered.median === null ? "No decisions" : days(hovered.median)} color={PINK} />
              <TipRow label="Decisions" value={hovered.count} />
              {hovered.slowest ? <TipRow label={`Slowest ${hovered.slowest.reference}`} value={days(hovered.slowest.days)} /> : null}
            </Tip>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ price radar

type Side = "all" | "up" | "down";

/**
 * Every submission against the live price it would replace. Above the line is
 * a rise, below is a cut; dot size grows with the size of the change. Two
 * colours for the two directions, always named in the legend and tooltip.
 */
export function PriceRadar({ points, since, now }: { points: PricePoint[]; since: number; now: number }) {
  const router = useRouter();
  const mounted = useMounted();
  const [hover, setHover] = useState<string | null>(null);
  const [side, setSide] = useState<Side>("all");
  const [asTable, setAsTable] = useState(false);
  const [box, W] = useChartWidth<HTMLDivElement>(1100);

  if (points.length === 0) {
    return <Empty>No price changes against a live price were submitted in this period.</Empty>;
  }

  const shown = points.filter((p) => side === "all" || (side === "up" ? p.pct > 0 : p.pct < 0));
  const ups = points.filter((p) => p.pct > 0);
  const downs = points.filter((p) => p.pct < 0);
  const avg = (xs: PricePoint[]) => (xs.length ? xs.reduce((t, p) => t + p.pct, 0) / xs.length : 0);

  const H = 320;
  const pad = { top: 16, right: 16, bottom: 28, left: 52 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const ext = niceMax(Math.max(5, ...points.map((p) => Math.abs(p.pct))));
  const x = (t: number) => pad.left + ((t - since) / Math.max(1, now - since)) * innerW;
  const y = (v: number) => pad.top + innerH / 2 - (Math.max(-ext, Math.min(ext, v)) / ext) * (innerH / 2);
  const r = (p: PricePoint) => 4 + 6 * Math.sqrt(Math.min(1, Math.abs(p.pct) / ext));
  const color = (p: PricePoint) => (p.pct > 0 ? PINK : p.pct < 0 ? VIOLET : "#9A9396");
  const xTicks = Array.from({ length: 5 }, (_, i) => since + ((now - since) * i) / 4);
  const yTicks = [-ext, -ext / 2, 0, ext / 2, ext];
  const hovered = points.find((p) => p.id === hover) ?? null;
  const open = (id: string) => router.push(`/agreements/${id}`);

  const filter = (v: Side, label: string, n: number) => (
    <button type="button" className={side === v ? "chip-active" : "chip"} onClick={() => setSide(v)}>
      {label} <span className="ml-1 tabular-nums opacity-70">{n}</span>
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {filter("all", "All", points.length)}
          {filter("up", "Increases", ups.length)}
          {filter("down", "Decreases", downs.length)}
        </div>
        <div className="flex items-center gap-4">
          <Legend
            items={[
              { label: "Increase", color: PINK, round: true },
              { label: "Decrease", color: VIOLET, round: true },
            ]}
          />
          <TableToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
        </div>
      </div>
      <p className="px-5 pt-3 text-xs text-charcoal/60">
        <span className="font-semibold text-charcoal">{ups.length}</span> increases averaging{" "}
        <span className="font-semibold text-charcoal">{signedPct(avg(ups))}</span>,{" "}
        <span className="font-semibold text-charcoal">{downs.length}</span> decreases averaging{" "}
        <span className="font-semibold text-charcoal">{signedPct(avg(downs))}</span>. Compared with the live price at the
        time of submission, same currency only. Select a dot to open the agreement.
      </p>

      {asTable ? (
        <div className="max-h-80 overflow-auto px-5 py-4">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">Agreement</th>
                <th className="th">Item</th>
                <th className="th text-right">Was</th>
                <th className="th text-right">Proposed</th>
                <th className="th text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {[...shown]
                .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
                .map((p) => (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="td py-2">
                      <Link href={`/agreements/${p.id}`} className="font-semibold text-pink hover:underline">
                        {p.reference}
                      </Link>
                      <span className="block text-xs text-charcoal/60">{p.vendor}</span>
                    </td>
                    <td className="td py-2 text-sm">{p.itemNumber}</td>
                    <td className="td py-2 text-right tabular-nums">{price(p.previous, p.currency)}</td>
                    <td className="td py-2 text-right tabular-nums">{price(p.amount, p.currency)}</td>
                    <td className="td py-2 text-right font-semibold tabular-nums">{signedPct(p.pct)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative pb-3 pt-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="Proposed price change against the live price, by submission date"
            onMouseLeave={() => setHover(null)}
          >
            <rect x={pad.left} y={pad.top} width={innerW} height={innerH / 2} fill="#FDF4F8" />
            <rect x={pad.left} y={pad.top + innerH / 2} width={innerW} height={innerH / 2} fill="#F7F3FB" />
            <text x={pad.left + 8} y={pad.top + 14} fontSize={11} fill={AXIS_TEXT}>
              Price increases
            </text>
            <text x={pad.left + 8} y={pad.top + innerH - 8} fontSize={11} fill={AXIS_TEXT}>
              Price decreases
            </text>
            {yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={W - pad.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? INK : GRID}
                  strokeOpacity={t === 0 ? 0.5 : 1}
                  strokeDasharray={t === 0 ? undefined : "2 4"}
                />
                <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
                  {t === 0 ? "0%" : signedPct(t)}
                </text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text
                key={t}
                x={x(t)}
                y={H - 8}
                textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
                fontSize={11}
                fill={AXIS_TEXT}
              >
                {shortDay(t)}
              </text>
            ))}
            {shown.map((p, i) => {
              const active = hover === p.id;
              return (
                <g key={p.id}>
                  <circle
                    cx={x(p.at)}
                    cy={y(p.pct)}
                    r={active ? r(p) + 2 : r(p)}
                    fill={color(p)}
                    fillOpacity={hover && !active ? 0.35 : 0.9}
                    stroke="#fff"
                    strokeWidth={2}
                    style={{
                      transformBox: "fill-box",
                      transformOrigin: "center",
                      transform: mounted ? "scale(1)" : "scale(0)",
                      transition: `transform 450ms cubic-bezier(.34,1.56,.64,1) ${Math.min(i * 12, 600)}ms, fill-opacity 150ms`,
                    }}
                  />
                  <circle
                    cx={x(p.at)}
                    cy={y(p.pct)}
                    r={r(p) + 7}
                    fill="transparent"
                    className="cursor-pointer outline-none"
                    tabIndex={0}
                    role="link"
                    aria-label={`${p.reference}, ${p.vendor}, ${signedPct(p.pct)}`}
                    onMouseEnter={() => setHover(p.id)}
                    onFocus={() => setHover(p.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => open(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") open(p.id);
                    }}
                  />
                </g>
              );
            })}
          </svg>
          {hovered ? (
            <Tip left={(x(hovered.at) / W) * 100} top={y(hovered.pct) > H / 2 ? 8 : "52%"}>
              <TipTitle>
                {hovered.reference} . {shortDay(hovered.at)}
              </TipTitle>
              <p className="mt-1 font-semibold text-charcoal">{hovered.vendor}</p>
              <p className="text-charcoal/60">
                {hovered.itemNumber}
                {hovered.itemName ? ` . ${hovered.itemName}` : ""}
              </p>
              <TipRow label="Was" value={price(hovered.previous, hovered.currency)} />
              <TipRow label="Proposed" value={price(hovered.amount, hovered.currency)} />
              <TipRow
                label={hovered.pct >= 0 ? "Increase" : "Decrease"}
                value={signedPct(hovered.pct)}
                color={color(hovered)}
              />
              <p className="mt-1 text-charcoal/60">{STATUS_TEXT[hovered.status] ?? hovered.status}</p>
            </Tip>
          ) : null}
        </div>
      )}
    </div>
  );
}
