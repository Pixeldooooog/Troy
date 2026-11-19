import { useState } from "react";
import type { Candle, View } from "./data";
import { useT } from "./i18n";

const clock = (t: number) =>
  new Date(t * 1000).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export function Chart({
  bars,
  chartType,
  target,
  seconds,
  unit,
  empty,
  note,
}: {
  chartType: View;
  target?: number;
  bars: Candle[];
  seconds: number;
  unit: string;
  empty: string;
  note: string;
}) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const calendar = !["line", "candles"].includes(chartType);
  const format = (ts: number) =>
    calendar
      ? new Date(ts * 1000).toLocaleDateString("zh-CN", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          ...(chartType === "month" ? {} : { day: "2-digit" as const }),
        })
      : clock(ts);
  const interval =
    chartType === "month"
      ? 30 * 86400
      : chartType === "week"
        ? 7 * 86400
        : 86400;
  const end =
    calendar && bars.length
      ? bars[bars.length - 1].time + interval / 2
      : Math.floor(Date.now() / 1000 / seconds) * seconds;
  const start =
    calendar && bars.length ? bars[0].time - interval / 2 : end - 1800;
  const line = chartType === "line";
  const last = bars[bars.length - 1];
  const active = bars.find((b) => b.time === hover) ?? last;
  const min = Math.min(...bars.map((b) => (line ? b.close : b.low))),
    max = Math.max(...bars.map((b) => (line ? b.close : b.high)));
  const pad = Math.max(0.02, (max - min) * 0.15);
  const bottom = min - pad,
    top = max + pad;
  const axis = 660;
  const x = (ts: number) => 12 + ((ts - start) / (end - start)) * (axis - 24);
  const y = (price: number) => 12 + ((top - price) / (top - bottom)) * 205;
  const width = Math.min(
    16,
    ((calendar ? interval : seconds) / (end - start)) * axis * 0.52,
  );
  const visible = bars.filter((b) => b.time >= start && b.time <= end);
  return (
    <>
      <div className="ohlc">
        {active ? (
          <>
            <b>{format(active.time)}</b>
            {line ? (
              <span>
                {t.close} <b>{active.close.toFixed(2)}</b>
              </span>
            ) : (
              t.ohlc.map((v, i) => (
                <span key={v}>
                  {v}{" "}
                  <b>
                    {[active.open, active.high, active.low, active.close][
                      i
                    ].toFixed(2)}
                  </b>
                </span>
              ))
            )}
          </>
        ) : (
          <span>{empty}</span>
        )}
        <i>{unit}</i>
      </div>
      <svg
        viewBox="0 0 726 247"
        role="img"
        aria-label={
          calendar
            ? "本机历史采样 K 线"
            : line
              ? "最近三十分钟分时折线"
              : "最近三十分钟采样 K 线"
        }
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const svg = e.currentTarget,
            matrix = svg.getScreenCTM();
          if (!matrix || !last) return;
          const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
            matrix.inverse(),
          );
          const nearest = bars.reduce((a, b) =>
            Math.abs(x(a.time) - pt.x) < Math.abs(x(b.time) - pt.x) ? a : b,
          );
          setHover(nearest.time);
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              className="grid"
              x1="0"
              x2={axis}
              y1={12 + i * 51.25}
              y2={12 + i * 51.25}
            />
            <text x={axis + 8} y={16 + i * 51.25}>
              {last ? (top - (i * (top - bottom)) / 4).toFixed(2) : "—"}
            </text>
          </g>
        ))}
        {(calendar
          ? bars
              .filter((_, i) =>
                [
                  0,
                  Math.round((bars.length - 1) / 3),
                  Math.round(((bars.length - 1) * 2) / 3),
                  bars.length - 1,
                ].includes(i),
              )
              .map((b) => b.time)
          : [0, 1, 2, 3].map((i) => start + i * 600)
        ).map((tick, i, ticks) => (
          <text
            key={i}
            x={x(tick)}
            y="240"
            textAnchor={
              i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"
            }
          >
            {format(tick)}
          </text>
        ))}
        {target != null && last && target >= bottom && target <= top && (
          <line
            className="target"
            x1="0"
            x2={axis}
            y1={y(target)}
            y2={y(target)}
          >
            <title>目标价 {target.toFixed(2)}</title>
          </line>
        )}
        {hover !== null && active && (
          <line
            className="cursor"
            x1={x(active.time)}
            x2={x(active.time)}
            y1="8"
            y2="217"
          />
        )}
        {line ? (
          <g fill="var(--accent)">
            <path
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.6"
              strokeLinejoin="round"
              d={visible
                .map((b, i) => {
                  const connected =
                    i > 0 && b.time - visible[i - 1].time === seconds;
                  return (connected ? "L" : "M") + x(b.time) + " " + y(b.close);
                })
                .join(" ")}
            />
            {visible
              .filter(
                (b, i) =>
                  b === last ||
                  b === active ||
                  (visible[i - 1]?.time !== b.time - seconds &&
                    visible[i + 1]?.time !== b.time + seconds),
              )
              .map((b) => (
                <circle
                  key={b.time}
                  cx={x(b.time)}
                  cy={y(b.close)}
                  r={b === active ? 3 : 2}
                />
              ))}
          </g>
        ) : (
          visible.map((b) => (
            <g
              key={b.time}
              fill={
                b.close > b.open
                  ? "var(--rise)"
                  : b.close < b.open
                    ? "var(--fall)"
                    : "var(--muted)"
              }
            >
              <rect
                x={x(b.time) - 0.6}
                width="1.2"
                y={y(b.high)}
                height={Math.max(1.3, y(b.low) - y(b.high))}
              />
              <rect
                x={x(b.time) - width / 2}
                width={width}
                y={Math.min(y(b.open), y(b.close))}
                height={Math.max(1.6, Math.abs(y(b.open) - y(b.close)))}
              />
            </g>
          ))
        )}
      </svg>
      <div className="legend">
        <span>{note}</span>
        {line ? (
          <span>{t.everyN(seconds / 60)}</span>
        ) : (
          <>
            <span className="up">{t.up}</span>
            <span className="down">{t.down}</span>
          </>
        )}
        <span>
          {calendar
            ? t.periods(bars.length)
            : t.gaps}
        </span>
        {target != null && last && (
          <span className="tgt">
            {t.targetLine} {target.toFixed(2)}
            {target > top
              ? t.aboveChart
              : target < bottom
                ? t.belowChart
                : ""}
          </span>
        )}
      </div>
    </>
  );
}
