"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Shared pieces for the staff analytics charts. Hand-drawn SVG, as on the
 * vendor Home page, so the brand palette and type stay exact.
 *
 * Series colours were run through a colour-blind separation validator as a
 * set: Power Pink, violet and teal pass lightness, chroma, CVD separation and
 * contrast on white. Status colours are kept apart from series colours and are
 * always shown with an icon and a label.
 */
export const SERIES = ["#ED3B86", "#7B4FB0", "#2A9D8F"] as const;
export const PINK = SERIES[0];
export const VIOLET = SERIES[1];
/** Remainder or "nothing yet". Not a series colour. */
export const TRACK = "#EBE3F4";
export const GRID = "#E9E2E6";
export const AXIS_TEXT = "#45404199";
export const INK = "#454041";

export const STATUS = {
  SUCCESS: { color: "#0CA30C", icon: "✓", label: "Success" },
  PARTIAL: { color: "#FAB219", icon: "!", label: "Partial" },
  STALLED: { color: "#EC835A", icon: "⏸", label: "Stalled" },
  FAILED: { color: "#D03B3B", icon: "✕", label: "Failed" },
  RUNNING: { color: "#9A9396", icon: "…", label: "Running" },
} as const;

export function compact(n: number) {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function num(n: number, digits = 0) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export function price(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 4 }).format(n);
  } catch {
    return `${num(n, 2)} ${currency}`;
  }
}

export function days(n: number) {
  if (n < 1) return `${num(n * 24, 0)} h`;
  return `${num(n, n < 10 ? 1 : 0)} d`;
}

export function signedPct(n: number) {
  return `${n > 0 ? "+" : ""}${num(n, Math.abs(n) < 10 ? 1 : 0)}%`;
}

export function shortDay(t: number) {
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function dayTime(t: number) {
  return new Date(t).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

/**
 * The rendered width of a chart, so SVG is drawn at 1:1 and text stays at its
 * real size whatever the column width. Falls back until the first measurement.
 */
export function useChartWidth<T extends HTMLElement>(fallback = 800) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(320, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Width and height of a box that fills the space its parent gives it. The SVG
 * inside is positioned absolutely so it never feeds back into that size, which
 * lets charts in one row stretch to match the tallest panel.
 */
export function useChartSize<T extends HTMLElement>(fallbackW = 480, fallbackH = 240) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: fallbackW, h: fallbackH });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize({ w: Math.max(280, Math.round(el.clientWidth)), h: Math.max(180, Math.round(el.clientHeight)) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size.w, size.h] as const;
}

/** The one row of controls above each chart, the same height in every panel so plots start level. */
export function ChartBar({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[50px] flex-wrap items-center justify-between gap-2 px-5 pt-4">{children}</div>;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True one frame after mount, so widths and heights can transition in from zero. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

type KpiKind = "int" | "days" | "pct" | "signedPct";

function formatKpi(v: number, kind: KpiKind) {
  if (kind === "days") return days(v);
  if (kind === "pct") return `${num(v, 0)}%`;
  if (kind === "signedPct") return signedPct(v);
  return num(Math.round(v));
}

/** A headline number that counts up on load. Null shows a dash, never a fake zero. */
export function KpiTile({
  label,
  value,
  kind = "int",
  hint,
  tone = "plain",
  href,
}: {
  label: string;
  value: number | null;
  kind?: KpiKind;
  hint?: string;
  tone?: "plain" | "accent" | "alert";
  href?: string;
}) {
  const shown = useCountUp(value ?? 0);
  const alert = tone === "alert" && (value ?? 0) > 0;
  const body = (
    <>
      <p className="field-label flex items-center gap-2">
        {alert ? (
          <span className="relative inline-flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-pink opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-pink" />
          </span>
        ) : null}
        {label}
      </p>
      <p
        className={`font-display text-4xl font-black leading-none tracking-[-0.01em] tabular-nums ${
          tone === "accent" || alert ? "text-pink" : "text-vanta"
        }`}
      >
        {value === null ? "–" : formatKpi(shown, kind)}
      </p>
      {hint ? <p className="mt-2 text-xs text-charcoal/60">{hint}</p> : null}
    </>
  );
  const cls = `panel block p-5 transition ${alert ? "border-pink/50" : ""}`;
  return href ? (
    <Link href={href} className={`${cls} hover:-translate-y-0.5 hover:border-pink hover:shadow-md motion-reduce:hover:translate-y-0`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function RangeChips({ basePath, value }: { basePath: string; value: number }) {
  const options = [
    { v: 30, label: "30 days" },
    { v: 90, label: "90 days" },
    { v: 365, label: "12 months" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
      {options.map((o) => (
        <Link
          key={o.v}
          href={`${basePath}?range=${o.v}`}
          scroll={false}
          className={o.v === value ? "chip-active" : "chip"}
          aria-current={o.v === value ? "true" : undefined}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function Swatch({ color, round }: { color: string; round?: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 ${round ? "rounded-full" : "rounded-[3px]"}`}
      style={{ background: color }}
      aria-hidden
    />
  );
}

export function Legend({ items }: { items: { label: string; color: string; round?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-charcoal/70">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <Swatch color={i.color} round={i.round} /> {i.label}
        </span>
      ))}
    </div>
  );
}

export function TableToggle({ asTable, onToggle }: { asTable: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="text-xs font-semibold text-charcoal/60 underline-offset-2 hover:text-pink hover:underline"
      onClick={onToggle}
    >
      {asTable ? "Show chart" : "Show as table"}
    </button>
  );
}

/** Floating card positioned over a chart; `left` is a percentage of the chart width. */
export function Tip({ left, top = 8, children }: { left: number; top?: number | string; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[160px] max-w-[260px] -translate-x-1/2 rounded-field border border-line bg-white px-3 py-2 text-xs shadow-lg"
      style={{ left: `clamp(90px, ${left}%, calc(100% - 90px))`, top }}
    >
      {children}
    </div>
  );
}

export function TipTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-headline text-[10px] font-bold uppercase tracking-[0.14em] text-charcoal/60">{children}</p>
  );
}

export function TipRow({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <p className="mt-0.5 flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5">
        {color ? <Swatch color={color} /> : null}
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-12 text-center text-sm text-charcoal/60">{children}</p>;
}
