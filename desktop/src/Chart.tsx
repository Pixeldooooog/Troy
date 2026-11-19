import { useState } from "react";
import type { Candle } from "./main";

const clock = (t: number) =>
  new Date(t * 1000).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export function Chart({
  bars,
  seconds,
  unit,
  empty,
}: {
  bars: Candle[];
  seconds: number;
  unit: string;
  empty: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const end = Math.floor(Date.now() / 1000 / seconds) * seconds;
  const start = end - 1800;
  const last = bars[bars.length - 1];
  const active = bars.find((b) => b.time === hover) ?? last;
  const min = Math.min(...bars.map((b) => b.low)),
    max = Math.max(...bars.map((b) => b.high));
  const pad = Math.max(0.02, (max - min) * 0.15);
  const bottom = min - pad,
    top = max + pad;
  const axis = 660;
  const x = (t: number) => 12 + ((t - start) / 1800) * (axis - 24);
  const y = (price: number) => 12 + ((top - price) / (top - bottom)) * 205;
  const width = Math.min(16, (seconds / 1800) * axis * 0.52);
  return (
    <>
      <div className="ohlc">
        {active ? (
          <>
            <b>{clock(active.time)}</b>
            {["开", "高", "低", "收"].map((v, i) => (
              <span key={v}>
                {v}{" "}
                <b>
                  {[active.open, active.high, active.low, active.close][
                    i
                  ].toFixed(2)}
                </b>
              </span>
            ))}
          </>
        ) : (
          <span>{empty}</span>
        )}
        <i>{unit}</i>
      </div>
      <svg
        viewBox="0 0 726 247"
        role="img"
        aria-label="最近三十分钟的采样 K 线"
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
        {[0, 1, 2, 3].map((i) => (
          <text
            key={i}
            x={x(start + i * 600)}
            y="240"
            textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}
          >
            {clock(start + i * 600)}
          </text>
        ))}
        {hover !== null && active && (
          <line
            className="cursor"
            x1={x(active.time)}
            x2={x(active.time)}
            y1="8"
            y2="217"
          />
        )}
        {bars
          .filter((b) => b.time >= start && b.time <= end)
          .map((b) => (
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
          ))}
      </svg>
      <div className="legend">
        <span>红涨</span>
        <span>绿跌</span>空白时段无采样
      </div>
    </>
  );
}
