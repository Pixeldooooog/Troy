import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/i18n";
import { clock, fmt, signed } from "@/lib/format";
import { isCny, OUNCE, SGE, SPOT, unitOf } from "@/lib/markets";
import type { Candle, CompareAxis } from "@/lib/types";
import { inWindow, latestMinute, linePath, minuteAt, quotePoints, segments } from "@/lib/tape";
import { useSettings } from "@/store/settings";

export type Line = { id: string; label: string; color: string; bars: Candle[]; dash?: string };

/** Market references drawn thin and light behind the user's holdings. */
const REFERENCES = [SGE, SPOT];

/** A round tick step (1, 2, 2.5 or 5 × 10ⁿ) giving about `count` intervals. */
function niceStep(span: number, count: number) {
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
}

export function CompareChart({ lines, cnyPerUsd }: { lines: Line[]; cnyPerUsd: number | null }) {
  const t = useT();
  const [settings, update] = useSettings();
  const [hidden, setHidden] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const fillId = "cmp" + useId().replace(/[^\w-]/g, "");
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(160, entry.contentRect.width)),
    );
    if (plot.current) observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);

  // "index" draws the same shape as "percent"; the toggle only offers percent.
  const stored = settings.compareAxis === "index" ? "percent" : settings.compareAxis;
  const axis = stored === "sgd" ? "cny" : stored;
  const relative = axis === "percent";
  const fxMissing = axis === "cny" && !cnyPerUsd;
  const note = relative
    ? t.intervalBase
    : axis === "cny"
      ? cnyPerUsd
        ? t.fxBasis(fmt(cnyPerUsd, 4))
        : t.fxMissing
      : t.nativeOnly;
  const end = latestMinute(),
    start = end - 1800;
  const active = cursor != null && cursor >= start && cursor <= end ? cursor : null;
  const series = lines.flatMap((line) => {
    let scale = 1;
    if (axis === "cny" && line.id === SPOT && cnyPerUsd) scale = cnyPerUsd / OUNCE;
    else if (
      !relative &&
      !(axis === "cny" && isCny(line.id)) &&
      !(axis === "usd" && line.id === SPOT)
    )
      return [];
    const pts = quotePoints(inWindow(line.bars, end), axis, scale);
    return [{ ...line, pts, runs: segments(pts) }];
  });
  const shown = series.filter((s) => !hidden.includes(s.id));
  const values = shown.flatMap((s) => s.pts.map((p) => p.value));
  const baseline = relative ? 0 : null;
  const range = values.length ? values : [0];
  const low = Math.min(...range, baseline ?? Infinity),
    high = Math.max(...range, baseline ?? -Infinity);
  const step = niceStep(Math.max(high - low, axis === "percent" ? 0.04 : 0.4), 4);
  const ymin = Math.floor((low - step * 0.15) / step) * step,
    ymax = Math.ceil((high + step * 0.15) / step) * step;
  const ticks = Array.from(
    { length: Math.round((ymax - ymin) / step) + 1 },
    (_, i) => ymin + i * step,
  );
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const left = 4,
    right = width - 62,
    top = 10,
    bottom = 300,
    height = 324;
  const x = (time: number) => left + ((time - start) / 1800) * (right - left);
  const y = (price: number) => top + ((ymax - price) / (ymax - ymin)) * (bottom - top);
  const display = (n: number) => (axis === "percent" ? signed(n) + "%" : fmt(n));
  const tickLabel = (n: number) =>
    axis === "percent" ? signed(n, digits) + "%" : n.toFixed(digits);
  const isRef = (id: string) => REFERENCES.includes(id);
  const owned = shown.filter((s) => !isRef(s.id));
  // Fill under the hovered legend item; otherwise a lighter fill under the first holding.
  const filled = focus ?? owned[0]?.id ?? null;
  const fillOpacity = focus || owned.length === 1 ? 0.2 : 0.12;
  // Current-value tags in the right gutter, nudged apart so they never overlap.
  const tags = owned
    .map((s) => ({ s, last: s.pts.at(-1) }))
    .filter((e): e is { s: (typeof owned)[number]; last: NonNullable<typeof e.last> } => !!e.last)
    .map((e) => ({ ...e, ty: y(e.last.value) }))
    .sort((a, b) => a.ty - b.ty);
  tags.forEach((tag, i) => {
    if (i > 0) tag.ty = Math.max(tag.ty, tags[i - 1].ty + 17);
  });
  const inspection = shown.map((s) => ({ ...s, p: s.pts.find((p) => p.time === active) }));
  return (
    <div className="compare-chart">
      <div className="compare-top" title={t.last30 + " · " + t.minuteClose + " · " + note}>
        <div className="series-legend">
          {series.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={!hidden.includes(s.id)}
              onPointerEnter={() => !isRef(s.id) && setFocus(s.id)}
              onPointerLeave={() => setFocus(null)}
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
        </div>
        <div className="segments" role="radiogroup" aria-label={t.yAxis}>
          {(
            [
              ["percent", "%"],
              ["cny", t.units.cny],
              ["usd", t.units.usd],
            ] as [CompareAxis, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={axis === value}
              aria-pressed={axis === value}
              onClick={() => update({ compareAxis: value })}
            >
              {label}
            </button>
          ))}
        </div>
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
          {ticks.map((v) => (
            <g key={v}>
              <line className="grid" x1={left} x2={right} y1={y(v)} y2={y(v)} />
              <text x={right + 8} y={y(v) + 4}>
                {values.length ? tickLabel(v) : "—"}
              </text>
            </g>
          ))}
          {baseline != null && values.length > 0 && (
            <line className="zero" x1={left} x2={right} y1={y(baseline)} y2={y(baseline)} />
          )}
          <line className="baseline" x1={left} x2={right} y1={bottom} y2={bottom} />
          {[1, 2].map((i) => (
            <line
              key={i}
              className="grid tick"
              x1={x(start + i * 600)}
              x2={x(start + i * 600)}
              y1={top}
              y2={bottom}
            />
          ))}
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
          {/* References first so holdings draw on top. */}
          {[...shown]
            .sort((a, b) => Number(isRef(b.id)) - Number(isRef(a.id)))
            .map((s, i) => {
              const dim = focus != null && focus !== s.id;
              return (
                <g key={s.id} className={dim ? "series dim" : "series"} style={{ color: s.color }}>
                  {filled === s.id && (
                    <defs>
                      <linearGradient id={fillId + i} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor={s.color} stopOpacity={fillOpacity} />
                        <stop offset="1" stopColor={s.color} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  )}
                  {filled === s.id &&
                    s.runs
                      .filter((run) => run.length > 1)
                      .map((run) => (
                        <path
                          key={"f" + run[0].time}
                          d={`${linePath(run, x, y)} L${x(run.at(-1)!.time)} ${bottom} L${x(run[0].time)} ${bottom} Z`}
                          fill={`url(#${fillId + i})`}
                        />
                      ))}
                  {s.runs.map((run) =>
                    run.length === 1 ? (
                      <circle
                        key={run[0].time}
                        cx={x(run[0].time)}
                        cy={y(run[0].value)}
                        r={2.2}
                        fill="currentColor"
                      />
                    ) : (
                      <path
                        key={run[0].time}
                        d={linePath(run, x, y)}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ),
                  )}
                </g>
              );
            })}
          {active == null &&
            tags.map(({ s, last, ty }) => (
              <g key={s.id} className={"end-tag" + (focus && focus !== s.id ? " dim" : "")}>
                <circle cx={x(last.time)} cy={y(last.value)} r="3.2" fill={s.color} />
                <rect x={right + 3} y={ty - 8.5} width="58" height="17" rx="4" fill={s.color} />
                <text x={right + 32} y={ty + 4} textAnchor="middle">
                  {display(last.value)}
                </text>
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
                        {axis === "cny" ? " " + t.units.cny : ""}
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
