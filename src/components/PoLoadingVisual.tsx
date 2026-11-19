"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shown while purchase orders are being refreshed.
 *
 * A field of bars that breathes on its own and leans towards the pointer, with
 * a ripple on click or tap. The steps underneath are the real stages reported
 * by the server, not a timer, so what it says is what is happening.
 */

const STAGES: { key: string; label: string }[] = [
  { key: "connecting", label: "Connecting" },
  { key: "headers", label: "Finding your purchase orders" },
  { key: "lines", label: "Reading order lines" },
  { key: "receipts", label: "Matching deliveries" },
  { key: "saving", label: "Building your charts" },
];

const BARS = 28;

export function PoLoadingVisual({ stage, startedAt }: { stage: string | null; startedAt: string | null }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointer = useRef<{ x: number; active: boolean }>({ x: 0.5, active: false });
  const ripples = useRef<{ x: number; t0: number }[]>([]);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t0 = startedAt ? new Date(startedAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - t0) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const draw = (now: number) => {
      const t = now / 1000;
      for (let i = 0; i < BARS; i++) {
        const el = barRefs.current[i];
        if (!el) continue;
        const x = i / (BARS - 1);
        // Idle motion: two slow waves, so it never looks like a loop.
        let h = reduced ? 0.45 : 0.32 + 0.16 * Math.sin(t * 1.7 + i * 0.45) + 0.1 * Math.sin(t * 0.9 - i * 0.8);
        // Lean towards the pointer.
        if (pointer.current.active) {
          const d = x - pointer.current.x;
          h += 0.5 * Math.exp(-(d * d) / 0.012);
        }
        // Ripples travel outwards from a click for just over a second.
        for (const r of ripples.current) {
          const age = t - r.t0;
          const front = age * 0.9;
          const d = Math.abs(x - r.x) - front;
          h += 0.45 * Math.exp(-(d * d) / 0.002) * Math.max(0, 1 - age / 1.2);
        }
        el.style.transform = `scaleY(${Math.min(1, Math.max(0.06, h))})`;
      }
      ripples.current = ripples.current.filter((r) => t - r.t0 < 1.2);
      if (!reduced || pointer.current.active || ripples.current.length) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const position = (clientX: number) => {
    const box = fieldRef.current?.getBoundingClientRect();
    if (!box) return 0.5;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  };

  const currentIndex = Math.max(
    0,
    STAGES.findIndex((s) => s.key === stage),
  );

  return (
    <div className="panel p-6 sm:p-8" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Refreshing your orders</p>
        <p className="text-xs tabular-nums text-charcoal/55">{elapsed}s</p>
      </div>
      <p className="mt-2 text-sm text-charcoal/70">
        Pulling your last two years of purchase orders. This usually takes a few seconds. Move across the bars or
        tap them while you wait.
      </p>

      <div
        ref={fieldRef}
        className="mt-6 flex h-44 cursor-pointer select-none items-end gap-[3px] rounded-field bg-blush px-3 pt-3 sm:gap-1"
        onPointerMove={(e) => {
          pointer.current = { x: position(e.clientX), active: true };
        }}
        onPointerLeave={() => {
          pointer.current.active = false;
        }}
        onPointerDown={(e) => {
          ripples.current.push({ x: position(e.clientX), t0: performance.now() / 1000 });
        }}
        aria-hidden="true"
      >
        {Array.from({ length: BARS }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className="h-full flex-1 origin-bottom rounded-t-[4px]"
            style={{
              background: i % 2 === 0 ? "#ED3B86" : "#7B4FB0",
              transform: "scaleY(0.3)",
              willChange: "transform",
            }}
          />
        ))}
      </div>

      <ol className="mt-6 grid gap-2 sm:grid-cols-5">
        {STAGES.map((s, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "now" : "next";
          return (
            <li
              key={s.key}
              className={`flex items-center gap-2 rounded-field border px-3 py-2 text-xs transition ${
                state === "now"
                  ? "border-pink bg-pink-50 text-pink-600"
                  : state === "done"
                    ? "border-line bg-white text-charcoal"
                    : "border-line bg-white text-charcoal/45"
              }`}
            >
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  state === "done" ? "bg-vanta text-white" : state === "now" ? "bg-pink text-white" : "bg-cloud text-charcoal/50"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className={state === "now" ? "font-semibold" : ""}>{s.label}</span>
              {state === "now" ? <span className="sr-only">(in progress)</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
