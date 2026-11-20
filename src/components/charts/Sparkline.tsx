import { useId, useState } from "react";
import { useT } from "@/i18n";
import { clock, fmt, trendClass, type Trend } from "@/lib/format";
import type { Candle } from "@/lib/types";
import { inWindow, latestMinute, linePath, minuteAt, segments } from "@/lib/tape";

export function Sparkline({ bars, trend, unit }: { bars: Candle[]; trend?: Trend; unit: string }) {
  const t = useT();
  const fillId = "fill" + useId().replace(/[^\w-]/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const end = latestMinute(),
    start = end - 1800;
  const points = inWindow(bars, end).map((b) => ({ time: b.time, value: b.close }));
  const amounts = points.map((p) => p.value);
  const low = Math.min(...amounts),
    high = Math.max(...amounts);
  const x = (time: number) => 2 + ((time - start) / 1800) * 116;
  const y = (v: number) => (high === low ? 20 : 3 + ((high - v) / (high - low)) * 34);
  const active = hover != null && hover >= start && hover <= end ? hover : null;
  const sample = points.find((p) => p.time === active);
  const direction = trend ?? trendClass(points.length ? points.at(-1)!.value - points[0].value : 0);
  return (
    <div className="spark-inspector">
      <svg
        className={"spark " + direction}
        viewBox="0 0 120 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(minuteAt((((e.clientX - rect.left) / rect.width) * 120 - 2) / 116, start));
        }}
      >
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {segments(points)
          .filter((run) => run.length > 1)
          .map((run) => (
            <path
              key={"f" + run[0].time}
              d={`${linePath(run, x, y)} L${x(run.at(-1)!.time)} 40 L${x(run[0].time)} 40 Z`}
              fill={`url(#${fillId})`}
              stroke="none"
            />
          ))}
        {segments(points).map((run) =>
          run.length === 1 ? (
            <circle
              key={run[0].time}
              cx={x(run[0].time)}
              cy={y(run[0].value)}
              r="1.3"
              fill="currentColor"
            />
          ) : (
            <path
              key={run[0].time}
              d={linePath(run, x, y)}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
        {active != null && (
          <line
            className="cursor"
            x1={x(active)}
            x2={x(active)}
            y1="0"
            y2="40"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {sample && <circle cx={x(sample.time)} cy={y(sample.value)} r="1.8" fill="currentColor" />}
      </svg>
      {active != null && (
        <span role="tooltip" className="spark-readout">
          {clock(active, false)} · {sample ? fmt(sample.value) + " " + unit : t.noMinute}
        </span>
      )}
    </div>
  );
}
