import { useId, useState } from "react";
import { useNow } from "@/hooks/useNow";
import { useT } from "@/i18n";
import type { Candle, View } from "@/lib/types";

const clock = (t: number) =>
  new Date(t * 1000).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export function CandleChart({
  bars,
  chartType,
  target,
  onTargetChange,
  displayPrice,
  nativePrice,
  seconds,
  unit,
  empty,
  note,
}: {
  chartType: View;
  target?: number;
  displayPrice: (native: number) => number;
  nativePrice: (value: number) => number;
  onTargetChange: (price: number) => Promise<boolean>;
  bars: Candle[];
  seconds: number;
  unit: string;
  empty: string;
  note: string;
}) {
  const t = useT();
  const fillId = "fill" + useId().replace(/[^\w-]/g, "");
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{
    id: number;
    startY: number;
    initial: number;
    value: number;
    top: number;
    bottom: number;
  } | null>(null);
  const [editor, setEditor] = useState<{ initial: string; convert: typeof nativePrice } | null>(
    null,
  );
  const now = useNow();
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
  const interval = chartType === "month" ? 30 * 86400 : chartType === "week" ? 7 * 86400 : 86400;
  const end =
    calendar && bars.length
      ? bars[bars.length - 1].time + interval / 2
      : Math.floor(now / seconds) * seconds;
  const start = calendar && bars.length ? bars[0].time - interval / 2 : end - 1800;
  const line = chartType === "line";
  const last = bars[bars.length - 1];
  const min = Math.min(target ?? Infinity, ...bars.map((b) => (line ? b.close : b.low))),
    max = Math.max(target ?? -Infinity, ...bars.map((b) => (line ? b.close : b.high)));
  const pad = Math.max(0.02, (max - min) * 0.15);
  const bottom = drag?.bottom ?? min - pad,
    top = drag?.top ?? max + pad;
  const shownTarget = drag?.value ?? target;
  const boundedPrice = (price: number) =>
    Math.min(999999999.99, Math.max(0.01, Math.round(price * 100) / 100));
  const pointerY = (event: React.PointerEvent<SVGGElement>) => {
    const matrix = event.currentTarget.ownerSVGElement?.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()).y
      : null;
  };
  const draggedPrice = (py: number) =>
    drag
      ? boundedPrice(drag.initial + ((drag.startY - py) * (drag.top - drag.bottom)) / 205)
      : target;
  const axis = 660;
  const x = (ts: number) => 12 + ((ts - start) / (end - start)) * (axis - 24);
  const y = (price: number) => 12 + ((top - price) / (top - bottom)) * 205;
  const width = Math.min(16, ((calendar ? interval : seconds) / (end - start)) * axis * 0.52);
  const visible = bars.filter((b) => b.time >= start && b.time <= end);
  const drift = visible.length > 1 ? visible.at(-1)!.close - visible[0].close : 0;
  const trend = drift > 0 ? "up" : drift < 0 ? "down" : "flat";
  // Connected runs of samples; gaps in sampling break both the line and its fill.
  const runs: Candle[][] = [];
  visible.forEach((b, i) => {
    if (i > 0 && b.time - visible[i - 1].time === seconds) runs.at(-1)!.push(b);
    else runs.push([b]);
  });
  const floor = 217;
  // Range strip under the time axis: one bar per sample, height = high − low.
  const ranges = visible.map((b) => b.high - b.low);
  const widest = Math.max(...ranges, 0);
  const barWidth = Math.max(1, Math.min(width * 0.35, 2.4));
  const cursorTime = hover ? start + ((hover.x - 12) / (axis - 24)) * (end - start) : start;
  const nearest =
    hover && visible.length
      ? visible.reduce((a, b) =>
          Math.abs(a.time - cursorTime) <= Math.abs(b.time - cursorTime) ? a : b,
        )
      : null;
  const selected =
    nearest && Math.abs(nearest.time - cursorTime) <= (calendar ? interval : seconds) / 2
      ? nearest
      : null;
  const active = hover ? selected : last;
  const tipRows = selected
    ? line
      ? [displayPrice(selected.close).toFixed(2) + " " + unit]
      : t.ohlc.map(
          (label, i) =>
            label +
            "  " +
            displayPrice([selected.open, selected.high, selected.low, selected.close][i]).toFixed(
              2,
            ) +
            " " +
            unit,
        )
    : [t.noMinute];
  const tipWidth = 144,
    tipHeight = 27 + tipRows.length * 16;
  return (
    <>
      <div className="ohlc">
        {active ? (
          <>
            <b>{format(active.time)}</b>
            {line ? (
              <span>
                {t.close} <b>{displayPrice(active.close).toFixed(2)}</b>
              </span>
            ) : (
              t.ohlc.map((v, i) => (
                <span key={v}>
                  {v}{" "}
                  <b>
                    {displayPrice([active.open, active.high, active.low, active.close][i]).toFixed(
                      2,
                    )}
                  </b>
                </span>
              ))
            )}
          </>
        ) : (
          <span>{hover && last ? t.noMinute : empty}</span>
        )}
        <i>{unit}</i>
      </div>
      <svg
        viewBox="0 0 726 272"
        role="group"
        aria-label={
          calendar ? "本机历史采样 K 线" : line ? "最近三十分钟分时折线" : "最近三十分钟采样 K 线"
        }
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const svg = e.currentTarget,
            matrix = svg.getScreenCTM();
          if (!matrix || !last || drag) return;
          const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
          setHover(
            pt.x >= 0 && pt.x <= axis && pt.y >= 8 && pt.y <= 217 ? { x: pt.x, y: pt.y } : null,
          );
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line className="grid" x1="0" x2={axis} y1={12 + i * 51.25} y2={12 + i * 51.25} />
            <text x={axis + 8} y={16 + i * 51.25}>
              {last || target != null
                ? displayPrice(top - (i * (top - bottom)) / 4).toFixed(2)
                : "—"}
            </text>
          </g>
        ))}
        <line className="baseline" x1="0" x2={axis} y1={floor} y2={floor} />
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
          <g key={i}>
            {i > 0 && i < ticks.length - 1 && (
              <line className="grid tick" x1={x(tick)} x2={x(tick)} y1="8" y2={floor} />
            )}
            <text
              x={x(tick)}
              y="240"
              textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
            >
              {format(tick)}
            </text>
          </g>
        ))}
        {widest > 0 && (
          <g className="range-strip">
            {visible.map((b, i) => {
              const h = Math.max(1, (ranges[i] / widest) * 12);
              return (
                <rect
                  key={b.time}
                  x={x(b.time) - barWidth / 2}
                  width={barWidth}
                  y={268 - h}
                  height={h}
                />
              );
            })}
          </g>
        )}
        {hover !== null && active && (
          <line className="cursor" x1={x(active.time)} x2={x(active.time)} y1="8" y2="217" />
        )}
        {line ? (
          <g className={"trend-line " + trend}>
            <defs>
              <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            {runs
              .filter((run) => run.length > 1)
              .map((run) => (
                <path
                  key={"f" + run[0].time}
                  fill={`url(#${fillId})`}
                  stroke="none"
                  d={
                    run.map((b, i) => (i ? "L" : "M") + x(b.time) + " " + y(b.close)).join(" ") +
                    ` L${x(run.at(-1)!.time)} ${floor} L${x(run[0].time)} ${floor} Z`
                  }
                />
              ))}
            {runs.map((run) => (
              <path
                key={run[0].time}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
                d={run.map((b, i) => (i ? "L" : "M") + x(b.time) + " " + y(b.close)).join(" ")}
              />
            ))}
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
                  fill="currentColor"
                />
              ))}
          </g>
        ) : (
          visible.map((b) => (
            <g
              key={b.time}
              fill={
                b.close > b.open ? "var(--rise)" : b.close < b.open ? "var(--fall)" : "var(--muted)"
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
        {shownTarget != null && (
          <>
            <g
              className="alert-line"
              data-no-swipe=""
              transform={`translate(0 ${y(shownTarget)})`}
              role="slider"
              tabIndex={0}
              aria-label={t.alertWhen}
              aria-valuenow={displayPrice(shownTarget)}
              aria-valuemin={displayPrice(0.01)}
              aria-valuemax={displayPrice(999999999.99)}
              aria-valuetext={displayPrice(shownTarget).toFixed(2) + " " + unit}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDrag(null);
                  return;
                }
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                onTargetChange(boundedPrice(shownTarget + (e.key === "ArrowUp" ? 0.01 : -0.01)));
              }}
              onPointerDown={(e) => {
                const py = pointerY(e);
                if (py == null || !e.isPrimary || e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                setHover(null);
                setDrag({
                  id: e.pointerId,
                  startY: py,
                  initial: shownTarget,
                  value: shownTarget,
                  top,
                  bottom,
                });
              }}
              onPointerMove={(e) => {
                e.stopPropagation();
                const py = pointerY(e);
                if (drag?.id === e.pointerId && py != null)
                  setDrag({ ...drag, value: draggedPrice(py)! });
              }}
              onPointerUp={(e) => {
                if (drag?.id !== e.pointerId) return;
                const py = pointerY(e);
                const price = py == null ? drag.value : draggedPrice(py)!;
                setDrag(null);
                if (price !== drag.initial) onTargetChange(price);
              }}
              onPointerCancel={() => setDrag(null)}
              onLostPointerCapture={() => setDrag(null)}
            >
              <title>{t.dragAlert}</title>
              <rect width={axis} y="-7" height="14" fill="transparent" />
              <line className="target" x1="0" x2={axis} y1="0" y2="0" />
            </g>
            <foreignObject
              x={axis}
              y={y(shownTarget) - 10}
              width="65"
              height="20"
              onPointerMove={(e) => e.stopPropagation()}
            >
              {editor ? (
                <form
                  className="target-editor"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem("value") as HTMLInputElement;
                    if (input.value === editor.initial) {
                      setEditor(null);
                      return;
                    }
                    const price = Math.round(editor.convert(input.valueAsNumber) * 100) / 100;
                    if (!Number.isFinite(price) || price < 0.01 || price >= 1e9) {
                      input.setCustomValidity(t.invalidTarget);
                      input.reportValidity();
                      return;
                    }
                    if (await onTargetChange(price)) setEditor(null);
                  }}
                >
                  <input
                    autoFocus
                    name="value"
                    type="number"
                    required
                    step="0.01"
                    aria-label={t.alertWhen + " (" + unit + ")"}
                    defaultValue={editor.initial}
                    onFocus={(e) => e.currentTarget.select()}
                    onInput={(e) => e.currentTarget.setCustomValidity("")}
                    onBlur={() => setEditor(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setEditor(null);
                      }
                    }}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className="alert-price-tag"
                  title={t.editTarget}
                  aria-label={
                    t.editTarget + " " + displayPrice(shownTarget).toFixed(2) + " " + unit
                  }
                  onClick={() => {
                    setHover(null);
                    setEditor({
                      initial: displayPrice(shownTarget).toFixed(2),
                      convert: nativePrice,
                    });
                  }}
                >
                  {displayPrice(shownTarget).toFixed(2)}
                </button>
              )}
            </foreignObject>
          </>
        )}
        {hover && last && (
          <g
            className="detail-tooltip"
            pointerEvents="none"
            transform={`translate(${hover.x + tipWidth + 10 <= axis ? hover.x + 10 : hover.x - tipWidth - 10},${hover.y + tipHeight + 10 <= 217 ? hover.y + 10 : Math.max(0, hover.y - tipHeight - 10)})`}
          >
            <rect width={tipWidth} height={tipHeight} rx="5" />
            <text x="9" y="16">
              {format(
                selected?.time ??
                  (calendar ? cursorTime : Math.round(cursorTime / seconds) * seconds),
              )}
            </text>
            {tipRows.map((row, i) => (
              <text className="detail-tooltip-value" key={i} x="9" y={33 + i * 16}>
                {row}
              </text>
            ))}
          </g>
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
        <span>{calendar ? t.periods(bars.length) : t.gaps}</span>
        {target != null && last && (
          <span className="tgt">
            {t.targetLine} {displayPrice(target).toFixed(2)}
            {target > top ? t.aboveChart : target < bottom ? t.belowChart : ""}
          </span>
        )}
      </div>
    </>
  );
}
