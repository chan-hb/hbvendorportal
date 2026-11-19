"use client";

import Link from "next/link";
import { useState } from "react";
import type { ResponseRow, SpreadRow } from "@/lib/analytics";
import { Empty, Legend, PINK, SERIES, TRACK, TableToggle, VIOLET, num, price, signedPct, useMounted } from "./kit";

// --------------------------------------------------------- response rates

const SEGMENTS = [
  { key: "submitted", label: "Quoted", color: SERIES[0] },
  { key: "viewed", label: "Viewed, no answer", color: SERIES[1] },
  { key: "declined", label: "Declined", color: SERIES[2] },
  { key: "notOpened", label: "Not opened", color: TRACK },
] as const;

/** Who answered each invitation. A full bar is everyone invited to that RFQ. */
export function ResponseRates({ rows }: { rows: ResponseRow[] }) {
  const mounted = useMounted();
  const [hover, setHover] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
  if (rows.length === 0) return <Empty>No suppliers were invited to an RFQ in this period.</Empty>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <Legend items={SEGMENTS.map((s) => ({ label: s.label, color: s.color }))} />
        <TableToggle asTable={asTable} onToggle={() => setAsTable((v) => !v)} />
      </div>
      {asTable ? (
        <div className="max-h-96 overflow-auto px-5 py-4">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-cloud/60">
              <tr>
                <th className="th">RFQ</th>
                {SEGMENTS.map((s) => (
                  <th key={s.key} className="th text-right">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="td py-2">
                    <Link href={`/rfq/${r.id}`} className="font-semibold text-pink hover:underline">
                      {r.reference}
                    </Link>
                  </td>
                  {SEGMENTS.map((s) => (
                    <td key={s.key} className="td py-2 text-right tabular-nums">
                      {r[s.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-1 px-3 py-4">
          {rows.map((r, i) => {
            const rate = ((r.submitted + r.declined) / r.total) * 100;
            const active = hover === r.id;
            return (
              <li key={r.id}>
                <Link
                  href={`/rfq/${r.id}`}
                  className={`grid grid-cols-[120px_1fr_52px] items-center gap-3 rounded-field px-2 py-2 transition ${
                    active ? "bg-blush" : ""
                  }`}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(r.id)}
                  onBlur={() => setHover(null)}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-pink">{r.reference}</span>
                    <span className="block truncate text-[11px] text-charcoal/60">{r.title}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]">
                      {SEGMENTS.map((s) =>
                        r[s.key] > 0 ? (
                          <span
                            key={s.key}
                            className="h-full transition-[flex-grow] duration-700 ease-out first:rounded-l-[4px] last:rounded-r-[4px] motion-reduce:transition-none"
                            style={{
                              flexGrow: mounted ? r[s.key] : 0,
                              flexBasis: 0,
                              background: s.color,
                              transitionDelay: `${i * 60}ms`,
                            }}
                          />
                        ) : null,
                      )}
                    </span>
                    <span className={`mt-1 block text-[11px] tabular-nums text-charcoal/60 ${active ? "" : "sr-only"}`}>
                      {r.submitted} quoted . {r.viewed} viewed . {r.declined} declined . {r.notOpened} not opened, of{" "}
                      {r.total} invited
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-lg font-black tabular-nums leading-none text-vanta">
                      {num(rate)}%
                    </span>
                    <span className="text-[10px] text-charcoal/55">answered</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ quote spread

/**
 * Lowest to highest quote at the RFQ's reference quantity. Each row has its
 * own scale, since RFQs are for different things in different currencies; the
 * spread figure on the right is what compares across rows.
 */
export function QuoteSpread({ rows }: { rows: SpreadRow[] }) {
  const mounted = useMounted();
  const [hover, setHover] = useState<string | null>(null);
  if (rows.length === 0) return <Empty>No quotations were submitted in this period.</Empty>;

  return (
    <div>
      <div className="px-5 pt-4">
        <Legend
          items={[
            { label: "Quote", color: VIOLET, round: true },
            { label: "Awarded", color: PINK, round: true },
          ]}
        />
      </div>
      <ul className="space-y-1 px-3 py-4">
        {rows.map((r) => {
          const span = r.max - r.min;
          const pos = (p: number) => (span > 0 ? 6 + ((p - r.min) / span) * 88 : 50);
          const spread = r.min > 0 ? (span / r.min) * 100 : 0;
          return (
            <li key={r.id} className="grid grid-cols-[120px_1fr_56px] items-center gap-3 rounded-field px-2 py-2 hover:bg-blush">
              <Link href={`/rfq/${r.id}`} className="min-w-0">
                <span className="block text-xs font-semibold text-pink hover:underline">{r.reference}</span>
                <span className="block truncate text-[11px] text-charcoal/60">{r.title}</span>
              </Link>
              <div className="min-w-0">
                <div className="relative h-7">
                  <span
                    className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-all duration-700 ease-out motion-reduce:transition-none"
                    style={{
                      background: TRACK,
                      left: mounted ? `${pos(r.min)}%` : "50%",
                      right: mounted ? `${100 - pos(r.max)}%` : "50%",
                    }}
                  />
                  {r.bids.map((b) => {
                    const awarded = b.id === r.awardedId;
                    const key = `${r.id}:${b.id}`;
                    const active = hover === key;
                    const vsLow = r.min > 0 ? ((b.price - r.min) / r.min) * 100 : 0;
                    return (
                      <span
                        key={b.id}
                        tabIndex={0}
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-1.5 outline-none"
                        style={{ left: `${mounted ? pos(b.price) : 50}%`, transition: "left 700ms ease-out" }}
                        onMouseEnter={() => setHover(key)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(key)}
                        onBlur={() => setHover(null)}
                        aria-label={`${b.vendor}: ${price(b.price, r.currency)}${awarded ? ", awarded" : ""}`}
                      >
                        <span
                          className={`block rounded-full border-2 border-white transition-transform ${
                            awarded ? "h-4 w-4 ring-2 ring-pink/40" : "h-3 w-3"
                          } ${active ? "scale-125" : ""}`}
                          style={{ background: awarded ? PINK : VIOLET }}
                        />
                        {active ? (
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max max-w-[220px] -translate-x-1/2 rounded-field border border-line bg-white px-3 py-2 text-xs shadow-lg">
                            <span className="block font-semibold text-charcoal">{b.vendor}</span>
                            <span className="block tabular-nums">{price(b.price, r.currency)}</span>
                            <span className="block text-charcoal/60">
                              {vsLow === 0 ? "Lowest quote" : `${signedPct(vsLow)} on the lowest`}
                              {awarded ? " . Awarded" : ""}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] tabular-nums text-charcoal/55">
                  <span>{price(r.min, r.currency)}</span>
                  <span>
                    {r.bids.length} {r.bids.length === 1 ? "quote" : "quotes"}
                  </span>
                  <span>{price(r.max, r.currency)}</span>
                </div>
              </div>
              <span className="text-right">
                <span className="block font-display text-lg font-black tabular-nums leading-none text-vanta">
                  {r.bids.length > 1 ? `${num(spread)}%` : "–"}
                </span>
                <span className="text-[10px] text-charcoal/55">spread</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
