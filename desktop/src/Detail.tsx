import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Chart } from "./Chart";
import {
  BENCHMARKS,
  clock,
  fmt,
  signed,
  tone,
  unitOf,
  viewKeys,
  type Candle,
  type Snapshot,
  type View,
} from "./data";
import { useT } from "./i18n";

export function Detail({
  market,
  data,
  tick,
  command,
}: {
  market: string;
  data?: Snapshot;
  tick: number;
  command: (name: string, args: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useT();
  const [chartType, setChartType] = useState<View>("line");
  const [editing, edit] = useState(false);
  const [series, setSeries] = useState<{ key: string; bars: Candle[] }>({
    key: "",
    bars: [],
  });
  const calendar = ["day", "week", "month"].includes(chartType);
  const [mode, seconds] = data?.chart ?? ["original", 60];
  const key = [market, chartType, mode, seconds].join();
  useEffect(() => {
    let active = true;
    const request = calendar
      ? invoke<Candle[]>("calendar", { market, period: chartType })
      : invoke<Candle[]>("history", { market, seconds, mode });
    request.then((bars) => active && setSeries({ key, bars })).catch(() => {});
    return () => {
      active = false;
    };
  }, [key, tick, calendar, market, chartType, mode, seconds]);
  useEffect(() => edit(false), [market]);

  const reading = data?.readings.find((r) => r.market === market);
  const q = reading?.quote;
  const unit = unitOf(market, t);
  const isBenchmark = BENCHMARKS.includes(market);
  const limit = data?.limits[market];
  const raw = calendar || mode === "original";
  const tray = navigator.platform.includes("Mac") ? t.menubar : t.tray;
  const below = limit != null && q != null && q.price <= limit;

  return (
    <>
      <header className="topbar">
        <div className="title">
          <h1>{t.markets[market]}</h1>
          <span className={"pill " + tone(reading?.status)} title={reading?.detail ?? ""}>
            {reading ? (t.status[reading.status] ?? reading.status) : t.loading}
          </span>
        </div>
        <div className="toolbar">
          <button
            className="ghost"
            disabled={!data || data.pinned === market}
            onClick={() => command("pin", { market })}
          >
            {(data?.pinned === market ? t.pinnedTo : t.pinTo) + tray}
          </button>
          <div className="popover-anchor">
            <button
              className={limit ? "primary" : "ghost"}
              disabled={!data}
              aria-expanded={editing}
              onClick={() => edit(!editing)}
            >
              {limit ? t.alertLe + limit.toFixed(2) : t.setAlert}
            </button>
            {editing && (
              <form
                key={market}
                className="popover"
                onKeyDown={(e) => e.key === "Escape" && edit(false)}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const value = new FormData(e.currentTarget).get("target");
                  if (await command("set_limit", { market, target: value ? Number(value) : null }))
                    edit(false);
                }}
              >
                <label htmlFor="target">{t.alertWhen}</label>
                <div className="field">
                  <input
                    autoFocus
                    id="target"
                    name="target"
                    type="number"
                    min=".01"
                    step=".01"
                    defaultValue={limit}
                    placeholder={q?.price.toFixed(2)}
                  />
                  <span>{unit}</span>
                </div>
                <div className="formactions">
                  {limit && (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={async () => {
                        if (await command("set_limit", { market, target: null })) edit(false);
                      }}
                    >
                      {t.disableAlert}
                    </button>
                  )}
                  <button className="primary">{t.save}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </header>
      <section className="quote">
        <div className="hero">
          <div className="label">{isBenchmark ? t.latest : t.buyPrice}</div>
          <div className="price">
            {fmt(q?.price)}
            <em>{unit}</em>
          </div>
          <div className="source">
            {q ? (
              <>
                {q.source}
                {q.published && (
                  <>
                    {" · "}
                    {t.quoted} {clock(q.published)}
                  </>
                )}
                {" · "}
                {t.observed} {clock(q.observed)}
              </>
            ) : (
              t.waiting
            )}
          </div>
        </div>
        <dl className="kpis">
          {!isBenchmark && (
            <>
              <div>
                <dt>{t.redemption}</dt>
                <dd>{fmt(q?.redemption)}</dd>
              </div>
              <div>
                <dt>{t.spread}</dt>
                <dd>{q && q.redemption != null ? fmt(q.price - q.redemption) : "—"}</dd>
              </div>
            </>
          )}
          <div>
            <dt>{t.target}</dt>
            <dd className={limit ? "" : "muted"}>{limit?.toFixed(2) ?? t.notSet}</dd>
          </div>
          <div>
            <dt>{below ? t.belowTarget : t.toTarget}</dt>
            <dd className={below ? "hit" : ""}>
              {limit != null && q ? signed(q.price - limit) : "—"}
            </dd>
          </div>
        </dl>
      </section>
      <section className="card chart">
        <div className="cardhead">
          <div className="tabs" role="tablist">
            {viewKeys.map((type) => (
              <button
                key={type}
                role="tab"
                aria-selected={chartType === type}
                onClick={() => setChartType(type)}
              >
                {t.views[type]}
              </button>
            ))}
          </div>
          {!calendar && (
            <div className="controls">
              <select
                aria-label={t.defaultMode}
                value={mode}
                onChange={(e) => command("set_chart", { mode: e.target.value, seconds })}
              >
                <option value="original">{t.rawQuote}</option>
                <option value="yuan_per_gram">{t.cnyPerGram}</option>
                <option value="relative">{t.relative}</option>
              </select>
              <div className="segments" role="group" aria-label={t.interval}>
                {[60, 300].map((n) => (
                  <button
                    key={n}
                    aria-pressed={seconds === n}
                    onClick={() => command("set_chart", { mode, seconds: n })}
                  >
                    {n / 60} {t.min}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Chart
          chartType={chartType}
          target={raw ? limit : undefined}
          bars={series.key === key ? series.bars : []}
          seconds={seconds}
          note={calendar ? t.localCalendar : t.last30}
          unit={
            calendar
              ? unit
              : mode === "relative"
                ? t.index
                : mode === "yuan_per_gram"
                  ? t.units.cny
                  : unit
          }
          empty={
            !calendar && market === "uob_sgd_gold_savings" && mode === "yuan_per_gram"
              ? t.noFx
              : t.noSamples
          }
        />
      </section>
    </>
  );
}
