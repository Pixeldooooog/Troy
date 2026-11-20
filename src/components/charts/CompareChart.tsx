import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { clock, fmt, signed } from "@/lib/format";
import { isCny, OUNCE, SPOT, unitOf } from "@/lib/markets";
import type { Candle, CompareAxis } from "@/lib/types";
import { inWindow, latestMinute, linePath, minuteAt, quotePoints, segments } from "@/lib/tape";
import { useSettings } from "@/store/settings";

export type Line = { id: string; label: string; color: string; bars: Candle[]; dashed?: boolean };

export function CompareChart({ lines, cnyPerUsd }: { lines: Line[]; cnyPerUsd: number | null }) {
  const t = useT();
  const [settings, update] = useSettings();
  const [hidden, setHidden] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(160, entry.contentRect.width)),
    );
    if (plot.current) observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);

  const hasSgd = lines.some((line) => line.id === "uob_sgd_gold_savings");
  const axis = settings.compareAxis === "sgd" && !hasSgd ? "cny" : settings.compareAxis;
  const relative = axis === "percent" || axis === "index";
  const fxMissing = axis === "cny" && !cnyPerUsd;
  const note = relative
    ? t.intervalBase
    : axis === "cny"
      ? cnyPerUsd
        ? t.fxBasis(fmt(cnyPerUsd, 4))
        : t.fxMissing
      : t.nativeOnly;
  const axisUnit = relative ? (axis === "percent" ? "%" : t.index) : t.units[axis];
  const end = latestMinute(),
    start = end - 1800;
  const active = cursor != null && cursor >= start && cursor <= end ? cursor : null;
  const series = lines.flatMap((line) => {
    let scale = 1;
    if (axis === "cny" && line.id === SPOT && cnyPerUsd) scale = cnyPerUsd / OUNCE;
    else if (
      !relative &&
      !(axis === "cny" && isCny(line.id)) &&
      !(axis === "usd" && line.id === SPOT) &&
      !(axis === "sgd" && line.id === "uob_sgd_gold_savings")
    )
      return [];
    const pts = quotePoints(inWindow(line.bars, end), axis, scale);
    return [{ ...line, pts, runs: segments(pts) }];
  });
  const shown = series.filter((s) => !hidden.includes(s.id));
  const values = shown.flatMap((s) => s.pts.map((p) => p.value));
  const baseline = axis === "percent" ? 0 : axis === "index" ? 100 : null;
  const range = values.length ? values : [0];
  const low = Math.min(...range, baseline ?? Infinity),
    high = Math.max(...range, baseline ?? -Infinity);
  const pad = Math.max(0.02, (high - low) * 0.12);
  const ymin = low - pad,
    ymax = high + pad;
  const left = 4,
    right = width - 58,
    top = 10,
    bottom = 181,
    height = 207;
  const x = (time: number) => left + ((time - start) / 1800) * (right - left);
  const y = (price: number) => top + ((ymax - price) / (ymax - ymin)) * (bottom - top);
  const display = (n: number) => (axis === "percent" ? signed(n) + "%" : fmt(n));
  const inspection = shown.map((s) => ({ ...s, p: s.pts.find((p) => p.time === active) }));
  return (
    <div className="compare-chart">
      <div className="compare-controls">
        <span>
          {t.last30} · {t.minuteClose}
        </span>
        <label>
          {t.yAxis}
          <select
            value={axis}
            onChange={(e) => update({ compareAxis: e.target.value as CompareAxis })}
          >
            <option value="percent">{t.intervalChange}</option>
            <option value="index">{t.relative}</option>
            <optgroup label={t.priceAxis}>
              <option value="cny">
                {t.priceAxis} · {t.units.cny}
              </option>
              <option value="usd">
                {t.priceAxis} · {t.units.usd}
              </option>
              {hasSgd && (
                <option value="sgd">
                  {t.priceAxis} · {t.units.sgd}
                </option>
              )}
            </optgroup>
          </select>
        </label>
      </div>
      <div className="series-legend">
        {series.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={!hidden.includes(s.id)}
            onClick={() =>
              setHidden((ids) =>
                ids.includes(s.id) ? ids.filter((id) => id !== s.id) : [...ids, s.id],
              )
            }
          >
            <i style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
        <small title={note}>{axisUnit}</small>
      </div>
      <div className="compare-plot" ref={plot}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          tabIndex={0}
          role="slider"
          aria-label={t.inspectTrend}
          aria-valuemin={0}
          aria-valuemax={30}
          aria-valuenow={((active ?? end) - start) / 60}
          aria-valuetext={
            active == null
              ? clock(end, false)
              : [
                  clock(active, false),
                  ...inspection.map(
                    (s) =>
                      s.label + " " + (s.p ? fmt(s.p.raw) + " " + unitOf(s.id, t) : t.noMinute),
                  ),
                ].join(" · ")
          }
          onFocus={() => setCursor((c) => c ?? end)}
          onBlur={() => setCursor(null)}
          onKeyDown={(e) => {
            const current = active ?? end;
            if (e.key === "ArrowLeft") setCursor(Math.max(start, current - 60));
            else if (e.key === "ArrowRight") setCursor(Math.min(end, current + 60));
            else if (e.key === "Home") setCursor(start);
            else if (e.key === "End") setCursor(end);
            else if (e.key === "Escape") setCursor(null);
            else return;
            e.preventDefault();
          }}
          onPointerLeave={() => setCursor(null)}
          onPointerMove={(e) => {
            const matrix = e.currentTarget.getScreenCTM();
            if (!matrix) return;
            const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
            setCursor(
              point.x < left || point.x > right || point.y > bottom || point.y < top
                ? null
                : minuteAt((point.x - left) / (right - left), start),
            );
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const v = ymax - (i * (ymax - ymin)) / 4;
            return (
              <g key={i}>
                <line className="grid" x1={left} x2={right} y1={y(v)} y2={y(v)} />
                <text x={right + 5} y={y(v) + 4}>
                  {values.length ? display(v) : "—"}
                </text>
              </g>
            );
          })}
          {baseline != null && values.length > 0 && (
            <line className="zero" x1={left} x2={right} y1={y(baseline)} y2={y(baseline)} />
          )}
          {[0, 1, 2, 3].map((i) => (
            <text
              key={i}
              x={x(start + i * 600)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"}
            >
              {clock(start + i * 600, false)}
            </text>
          ))}
          {shown.map((s) => (
            <g key={s.id}>
              {s.runs.map((run) =>
                run.length === 1 ? (
                  <circle
                    key={run[0].time}
                    cx={x(run[0].time)}
                    cy={y(run[0].value)}
                    r="2.2"
                    fill={s.color}
                  />
                ) : (
                  <path
                    key={run[0].time}
                    d={linePath(run, x, y)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.dashed ? 1.3 : 1.7}
                    strokeDasharray={s.dashed ? "4 3" : undefined}
                    strokeLinejoin="round"
                  />
                ),
              )}
            </g>
          ))}
          {active != null && (
            <>
              <line className="cursor" x1={x(active)} x2={x(active)} y1={top} y2={bottom} />
              {inspection.map(
                (s) =>
                  s.p && (
                    <circle
                      key={s.id}
                      cx={x(active)}
                      cy={y(s.p.value)}
                      r="3.5"
                      fill={s.color}
                      stroke="var(--panel)"
                      strokeWidth="1.5"
                    />
                  ),
              )}
            </>
          )}
          {!values.length && (
            <text x={right / 2} y={bottom / 2} textAnchor="middle">
              {shown.length ? t.noSamples : t.selectSeries}
            </text>
          )}
        </svg>
        {active != null && shown.length > 0 && (
          <div
            className={"inspect-box " + (active < start + 900 ? "at-right" : "at-left")}
            role="tooltip"
          >
            <header>
              <b>{clock(active, false)}</b>
              <span>
                {t.beijing} · {t.minuteClose}
              </span>
            </header>
            {inspection.map((s) => (
              <div className="inspect-row" key={s.id}>
                <i style={{ background: s.color }} />
                <span>{s.label}</span>
                {s.p ? (
                  <div>
                    <b>
                      {fmt(s.p.raw)} <small>{unitOf(s.id, t)}</small>
                    </b>
                    {(relative || (axis === "cny" && s.id === SPOT)) && (
                      <small>
                        {display(s.p.value)}
                        {axis === "index" ? " " + t.index : axis === "cny" ? " " + t.units.cny : ""}
                      </small>
                    )}
                  </div>
                ) : (
                  <small>{t.noMinute}</small>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {fxMissing && <p className="compare-note">{t.fxMissing}</p>}
    </div>
  );
}
