/**
 * Both datasets, day by day, and their running totals against the policy's
 * threshold. Bars: daily rain (primary dark, the other dataset lighter).
 * Lines: cumulative rain; the dashed rule is the threshold. Where the two
 * lines finish on opposite sides of the rule, the reading can be contested.
 */
import { mm, source } from "@/lib/present";
import type { Series, Source } from "@/lib/types";

export function RainChart({
  series, primary, other, threshold, selected,
}: { series: Record<Source, Series>; primary: Source; other: Source; threshold: number; selected: Source }) {
  const a = series[primary] ?? [];
  const b = series[other] ?? [];
  const n = Math.max(a.length, b.length, 1);
  const cum = (s: Series) => s.reduce<number[]>((acc, [, v]) => [...acc, (acc[acc.length - 1] ?? 0) + (v ?? 0)], []);
  const ca = cum(a);
  const cb = cum(b);
  const top = Math.max(threshold * 1.15, ...ca, ...cb, 10);
  const dayTop = Math.max(...a.map(([, v]) => v ?? 0), ...b.map(([, v]) => v ?? 0), 10);
  const W = 640, H = 260, L = 44, R = 12, T = 12, B = 30;
  const x = (i: number) => L + ((W - L - R) * (i + 0.5)) / n;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const bw = Math.max(2, ((W - L - R) / n) * 0.36);
  const dayY = (v: number) => (H - B) - ((H - T - B) * 0.45 * v) / dayTop;
  const path = (c: number[]) => c.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = [0, top / 2, top].map((v) => Math.round(v / 10) * 10);

  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
        aria-label={`Rain by day and in total over the window, from ${source(primary)} and ${source(other)}, against a threshold of ${mm(threshold)}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e3e3e2" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#666">{Math.round(t / 10)}</text>
          </g>
        ))}
        {a.map(([, v], i) => v === null ? null : (
          <rect key={`a${i}`} x={x(i) - bw} y={dayY(v)} width={bw} height={(H - B) - dayY(v)} fill="#3d7ea6" opacity="0.8" />
        ))}
        {b.map(([, v], i) => v === null ? null : (
          <rect key={`b${i}`} x={x(i)} y={dayY(v)} width={bw} height={(H - B) - dayY(v)} fill="#e7a43c" opacity="0.85" />
        ))}
        <line x1={L} x2={W - R} y1={y(threshold)} y2={y(threshold)} stroke="#421d24" strokeDasharray="6 5" strokeWidth="1.6" />
        <text x={W - R} y={y(threshold) - 6} textAnchor="end" fontSize="11.5" fill="#421d24">Threshold {mm(threshold)}</text>
        <path d={path(ca)} fill="none" stroke="#3d7ea6" strokeWidth="2.4" />
        <path d={path(cb)} fill="none" stroke="#e7a43c" strokeWidth="2.4" />
        <text x={L} y={H - 8} fontSize="11" fill="#666">{a[0]?.[0] ?? ""}</text>
        <text x={W - R} y={H - 8} textAnchor="end" fontSize="11" fill="#666">{a[a.length - 1]?.[0] ?? ""}</text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-rain" />{source(primary)} (primary){selected === primary ? ", the selected reading" : ""}: {mm(ca[ca.length - 1] ?? 0)}</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-harvest" />{source(other)} (backup){selected === other ? ", the selected reading" : ""}: {mm(cb[cb.length - 1] ?? 0)}</span>
        <span className="muted">Bars show each day, lines the running total, in millimetres.</span>
      </figcaption>
    </figure>
  );
}
