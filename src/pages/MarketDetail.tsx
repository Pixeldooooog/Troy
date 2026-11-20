import { sourceTiming, statusLabel } from "@/lib/quoteTiming";
import { useEffect, useState } from "react";
import { CandleChart } from "@/components/charts/CandleChart";
import type { Run } from "@/hooks/useSnapshot";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { fmt, signed } from "@/lib/format";
import { BENCHMARKS, tone, unitOf } from "@/lib/markets";
import { viewKeys, type Candle, type Mode, type Snapshot, type View } from "@/lib/types";

export function MarketDetail({
  market,
  data,
  tick,
  run,
}: {
  market: string;
  data?: Snapshot;
  tick: number;
  run: Run;
}) {
  const t = useT();
  const [chartType, setChartType] = useState<View>("line");
  // The alert popover belongs to one market and closes when switching.
  const [editingMarket, setEditingMarket] = useState<string | null>(null);
  const editing = editingMarket === market;
  const edit = (open: boolean) => setEditingMarket(open ? market : null);
  const [series, setSeries] = useState<{ key: string; bars: Candle[] }>({
    key: "",
    bars: [],
  });
  const calendar = ["day", "week", "month"].includes(chartType);
  const [mode, seconds]: [Mode, number] = data?.chart ?? ["original", 60];
  const key = [market, chartType, mode, seconds].join();
  useEffect(() => {
    let active = true;
    const request = calendar
      ? api.calendar(market, chartType as "day" | "week" | "month")
      : api.history(market, seconds, mode);
    request.then((bars) => active && setSeries({ key, bars })).catch(() => {});
    return () => {
      active = false;
    };
  }, [key, tick, calendar, market, chartType, mode, seconds]);

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
          {reading?.status !== "live" && (
            <span className={"pill " + tone(reading?.status)} title={reading?.detail ?? ""}>
              {reading ? statusLabel(reading, t) : t.loading}
            </span>
          )}
        </div>
        <div className="toolbar">
          <button
            className="ghost"
            disabled={!data || data.pinned === market}
            onClick={() => run(api.pin(market))}
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
                  if (await run(api.setLimit(market, value ? Number(value) : null))) edit(false);
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
                        if (await run(api.setLimit(market, null))) edit(false);
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
                {q.source} · {reading && sourceTiming(reading, t)} · {t.beijing}
              </>
            ) : (
              t.waiting
            )}
          </div>
          {market === "sge_au9999" && <p className="timing-note">{t.exchangeTiming}</p>}
          {market === "uob_sgd_gold_savings" && (
            <p className="timing-note">
              {t.uobTiming}
              {q?.published != null &&
                q.observed >= q.published &&
                " " + t.observedLag(Math.floor((q.observed - q.published) / 60))}
            </p>
          )}
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
                onChange={(e) => run(api.setChart(e.target.value as Mode, seconds))}
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
                    onClick={() => run(api.setChart(mode, n))}
                  >
                    {n / 60} {t.min}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <CandleChart
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
              : !calendar && market === "sge_au9999"
                ? t.noExchangeMinute
                : t.noSamples
          }
        />
      </section>
    </>
  );
}
