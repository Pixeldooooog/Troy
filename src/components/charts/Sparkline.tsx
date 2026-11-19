import { useId } from "react";
import type { Trend } from "@/lib/format";
import type { Candle } from "@/lib/types";

export function Sparkline({
  bars,
  trend,
  height = 40,
}: {
  bars: Candle[];
  /** Overrides the colour, e.g. with the day's direction. */
  trend?: Trend;
  height?: number;
}) {
  const id = useId();
  if (bars.length < 2) return <svg className="spark empty" viewBox={`0 0 120 ${height}`} />;
  const values = bars.map((b) => b.close);
  const min = Math.min(...values),
    max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * 120;
  const y = (v: number) => 3 + ((max - v) / span) * (height - 6);
  const d = values.map((v, i) => (i ? "L" : "M") + x(i) + " " + y(v)).join(" ");
  const dir =
    trend ?? (values.at(-1)! > values[0] ? "up" : values.at(-1)! < values[0] ? "down" : "flat");
  return (
    <svg
      className={"spark " + dir}
      viewBox={`0 0 120 ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L120 ${height} L0 ${height} Z`} fill={`url(#${id})`} />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
