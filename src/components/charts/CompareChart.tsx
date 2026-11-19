import { useState } from "react";
import { useNow } from "@/hooks/useNow";
import { clock, signed } from "@/lib/format";
import type { Candle } from "@/lib/types";

export type Line = { id: string; label: string; color: string; bars: Candle[]; dashed?: boolean };

/** Overlays several markets as percentage change from their first sample. */
export function CompareChart({ lines, empty }: { lines: Line[]; empty: string }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640,
    H = 220,
    L = 8,
    R = 52,
    TOP = 10,
    BOT = 24;
  const end = Math.floor(useNow() / 60) * 60;
  const start = end - 1800;
  const series = lines.map((l) => {
    const base = l.bars[0]?.open;
    return {
      ...l,
      pts: base
        ? l.bars
            .filter((b) => b.time >= start)
            .map((b) => ({ t: b.time, v: (b.close / base - 1) * 100 }))
        : [],
    };
  });
  const shown = series.filter((s) => !hidden.includes(s.id) && s.pts.length);
  const all = shown.flatMap((s) => s.pts.map((p) => p.v));
  const lo = Math.min(0, ...all),
    hi = Math.max(0, ...all);
  const pad = Math.max(0.02, (hi - lo) * 0.12);
  const bottom = lo - pad,
    top = hi + pad;
  const x = (t: number) => L + ((t - start) / (end - start)) * (W - L - R);
  const y = (v: number) => TOP + ((top - v) / (top - bottom)) * (H - TOP - BOT);
  const ticks = [0, 1, 2, 3, 4].map((i) => top - (i * (top - bottom)) / 4);
  const at = (s: (typeof series)[number], t: number) => [...s.pts].reverse().find((p) => p.t <= t);
  return (
    <div className="compare-chart">
      <div className="series-legend">
        {series.map((s) => {
          const off = hidden.includes(s.id);
          const p = hover != null ? at(s, hover) : s.pts.at(-1);
          return (
            <button
              key={s.id}
              aria-pressed={!off}
              onClick={() => setHidden((h) => (off ? h.filter((x) => x !== s.id) : [...h, s.id]))}
            >
              <i style={{ background: s.color }} className={s.dashed ? "dashed" : ""} />
              {s.label}
              <b className={p ? (p.v > 0 ? "up" : p.v < 0 ? "down" : "") : ""}>
                {p ? signed(p.v, 2) + "%" : "—"}
              </b>
            </button>
          );
        })}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const m = e.currentTarget.getScreenCTM();
          if (!m) return;
          const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
          const t = start + ((pt.x - L) / (W - L - R)) * (end - start);
          setHover(Math.max(start, Math.min(end, Math.round(t / 60) * 60)));
        }}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={W - R + 8} y={y(v) + 4}>
              {all.length ? signed(v, 2) + "%" : ""}
            </text>
          </g>
        ))}
        {all.length > 0 && <line className="zero" x1={L} x2={W - R} y1={y(0)} y2={y(0)} />}
        {[0, 1, 2].map((i) => (
          <text key={i} x={x(start + i * 600)} y={H - 6} textAnchor={i === 0 ? "start" : "middle"}>
            {clock(start + i * 600, false)}
          </text>
        ))}
        <text x={x(end)} y={H - 6} textAnchor="end">
          {clock(end, false)}
        </text>
        {shown.map((s) => (
          <path
            key={s.id}
            d={s.pts
              .map((p, i) => (i && p.t - s.pts[i - 1].t <= 120 ? "L" : "M") + x(p.t) + " " + y(p.v))
              .join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={s.dashed ? 1.3 : 1.8}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            strokeLinejoin="round"
          />
        ))}
        {hover != null && (
          <>
            <line className="cursor" x1={x(hover)} x2={x(hover)} y1={TOP} y2={H - BOT} />
            {shown.map((s) => {
              const p = at(s, hover);
              return p ? <circle key={s.id} cx={x(p.t)} cy={y(p.v)} r="3" fill={s.color} /> : null;
            })}
          </>
        )}
        {!all.length && (
          <text x={(W - R) / 2} y={H / 2} textAnchor="middle" className="placeholder">
            {empty}
          </text>
        )}
      </svg>
    </div>
  );
}
