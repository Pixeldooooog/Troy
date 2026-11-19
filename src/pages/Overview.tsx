import { sourceTiming, statusLabel } from "@/lib/quoteTiming";
import { CompareChart, type Line } from "@/components/charts/CompareChart";
import { Sparkline } from "@/components/charts/Sparkline";
import type { Series } from "@/hooks/useSeriesMap";
import { useT } from "@/i18n";
import { clock, fmt, money, signed, trendClass } from "@/lib/format";
import { FX, OUNCE, SGE, SPOT, comparableBanks, isCny, stampOf, tone, unitOf } from "@/lib/markets";
import type { Snapshot } from "@/lib/types";
import { useSettings } from "@/store/settings";

const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

export function Overview({
  data,
  series,
  open,
  openSettings,
  pin,
}: {
  data?: Snapshot;
  series: Record<string, Series>;
  open: (id: string) => void;
  openSettings: () => void;
  pin: (id: string) => void;
}) {
  const t = useT();
  const [settings] = useSettings();
  const readings = data?.readings ?? [];
  const quote = (id: string) => readings.find((r) => r.market === id)?.quote ?? null;
  const reading = (id: string) => readings.find((r) => r.market === id);
  const dayChange = (id: string) => {
    const q = quote(id),
      prev = series[id]?.prevClose;
    return q && prev ? { abs: q.price - prev, pct: (q.price / prev - 1) * 100 } : null;
  };
  const sge = quote(SGE),
    spot = quote(SPOT),
    fx = quote(FX);
  const fxStatus = reading(FX)?.status;
  const rate = fx && (fxStatus === "有效" || fxStatus === "延时参考") ? fx.price : null;
  const spotCny = spot && rate ? (spot.price * rate) / OUNCE : null;
  const held = settings.held;
  const pinLocation = navigator.platform.includes("Mac") ? t.menubar : t.tray;
  const newest = Math.max(0, ...readings.map((r) => r.quote?.observed ?? 0));

  // Portfolio totals: CNY accounts with grams entered.
  const positions = held
    .filter((id) => isCny(id) && settings.holdings[id]?.grams)
    .map((id) => {
      const h = settings.holdings[id],
        q = quote(id);
      const mark = q ? (q.redemption ?? q.price) : null;
      const d = dayChange(id);
      return {
        grams: h.grams!,
        value: mark != null ? mark * h.grams! : null,
        cost: h.cost ? h.cost * h.grams! : null,
        today: d ? d.abs * h.grams! : null,
      };
    });
  const sum = (k: "grams" | "value" | "cost" | "today") =>
    positions.some((p) => p[k] == null)
      ? null
      : positions.reduce((a, p) => a + (p[k] as number), 0);
  const totalValue = sum("value"),
    totalCost = sum("cost"),
    totalToday = sum("today");
  const pnl = totalValue != null && totalCost != null ? totalValue - totalCost : null;

  const ranked = comparableBanks(readings);
  const lo = ranked[0]?.quote!.price ?? 0,
    hi = ranked.at(-1)?.quote!.price ?? 0;

  const lines: Line[] = [
    ...held.map((id, i) => ({
      id,
      label: t.short[id],
      color: PALETTE[i % PALETTE.length],
      bars: series[id]?.intraday ?? [],
    })),
    {
      id: SGE,
      label: t.short[SGE],
      color: "var(--ink-2)",
      bars: series[SGE]?.intraday ?? [],
      dashed: true,
    },
    {
      id: SPOT,
      label: t.short[SPOT],
      color: "var(--muted)",
      bars: series[SPOT]?.intraday ?? [],
      dashed: true,
    },
  ];

  return (
    <>
      <header className="topbar">
        <div className="title">
          <h1>{t.overview}</h1>
        </div>
        <span className="updated">
          {newest
            ? `${clock(newest)} · ${settings.lang === "zh" ? "北京时间" : "Beijing time"}`
            : t.loading}
        </span>
      </header>

      {positions.length > 0 ? (
        <section className="summary">
          <div>
            <span>{t.marketValue}</span>
            <b title={t.valueHint}>{money(totalValue)}</b>
            <small>
              {t.holdingGrams} {fmt(sum("grams"), 3)} g
            </small>
          </div>
          <div>
            <span>{t.floatingPnl}</span>
            <b className={trendClass(pnl)}>{money(pnl, true)}</b>
            <small className={trendClass(pnl)}>
              {pnl != null && totalCost ? signed((pnl / totalCost) * 100) + "%" : t.notSet}
            </small>
          </div>
          <div>
            <span>{t.todayPnl}</span>
            <b className={trendClass(totalToday)}>{money(totalToday, true)}</b>
            <small>{t.dailyHint}</small>
          </div>
        </section>
      ) : (
        held.length > 0 && (
          <button className="banner" onClick={openSettings}>
            {t.addHoldings} →
          </button>
        )
      )}

      {held.length === 0 ? (
        <section className="card emptystate">
          <p>{t.noHeld}</p>
          <button className="primary" onClick={openSettings}>
            {t.chooseHeld}
          </button>
        </section>
      ) : (
        <section className="holdings">
          {held.map((id, i) => {
            const q = quote(id),
              r = reading(id),
              d = dayChange(id),
              h = settings.holdings[id];
            const premium = q && sge && isCny(id) ? q.price - sge.price : null;
            const mark = q ? (q.redemption ?? q.price) : null;
            const ownPnl = h?.grams && h.cost && mark != null ? (mark - h.cost) * h.grams : null;
            return (
              <div key={id} className="holding-wrap">
                <button className="card holding" onClick={() => open(id)}>
                  <div className="hold-head">
                    <i className="swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="hold-name">{t.markets[id]}</span>
                    <i
                      className={"dot " + tone(r?.status)}
                      title={r ? statusLabel(r, t) + " · " + sourceTiming(r, t) : ""}
                    />
                  </div>
                  <div className="hold-price">
                    <b>{fmt(q?.price)}</b>
                    <em>{unitOf(id, t)}</em>
                  </div>
                  <div className={"change " + trendClass(d?.abs)} title={t.dailyHint}>
                    {d ? `${signed(d.abs)}  ${signed(d.pct)}%` : t.daily + " —"}
                  </div>
                  <Sparkline
                    unit={unitOf(id, t)}
                    bars={series[id]?.intraday ?? []}
                    trend={d ? trendClass(d.abs) : undefined}
                  />
                  <dl className="hold-stats">
                    <div>
                      <dt>{t.redemption}</dt>
                      <dd>{fmt(q?.redemption)}</dd>
                    </div>
                    <div>
                      <dt>{t.spread}</dt>
                      <dd>{q && q.redemption != null ? fmt(q.price - q.redemption) : "—"}</dd>
                    </div>
                    <div title={t.premiumHint}>
                      <dt>{t.premium}</dt>
                      <dd>{signed(premium)}</dd>
                    </div>
                    {ownPnl != null && (
                      <div>
                        <dt>{t.floatingPnl}</dt>
                        <dd className={trendClass(ownPnl)}>{money(ownPnl, true)}</dd>
                      </div>
                    )}
                  </dl>
                </button>
                <button
                  type="button"
                  className="holding-pin"
                  aria-pressed={data?.pinned === id}
                  disabled={!data || data.pinned === id}
                  onClick={() => pin(id)}
                  aria-label={t.pinQuote(t.markets[id], pinLocation, data?.pinned === id)}
                  title={t.pinQuote(t.markets[id], pinLocation, data?.pinned === id)}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="1.5" y="3" width="13" height="10" rx="2" />
                    <path d="M2 6h12" />
                    <path d="m6 9 1.3 1.3L10 7.8" />
                  </svg>
                </button>
              </div>
            );
          })}
        </section>
      )}

      <div className="ov-grid">
        <section className="card">
          <div className="cardhead">
            <h2>{t.trend}</h2>
          </div>
          <CompareChart lines={lines} cnyPerUsd={rate} />
        </section>

        <div className="ov-side">
          <section className="card bench">
            <div className="cardhead">
              <h2>{t.benchmarks}</h2>
            </div>
            {[SGE, SPOT].map((id) => {
              const q = quote(id),
                d = dayChange(id);
              return (
                <button key={id} className="bench-row" onClick={() => open(id)}>
                  <span>
                    {t.markets[id]}
                    <small>
                      {unitOf(id, t)}
                      {id === SGE && reading(id) ? " · " + statusLabel(reading(id)!, t) : ""}
                    </small>
                  </span>
                  <b>{fmt(q?.price)}</b>
                  <em className={trendClass(d?.pct)}>{d ? signed(d.pct) + "%" : "—"}</em>
                </button>
              );
            })}
            <div className="bench-row static">
              <span>
                {t.intlCny}
                <small>{t.units.cny}</small>
              </span>
              <b>{fmt(spotCny)}</b>
              <em />
            </div>
            <div className="bench-row static" title={t.domesticPremiumHint}>
              <span>
                {t.domesticPremium}
                <small>{t.units.cny}</small>
              </span>
              <b className={trendClass(sge && spotCny ? sge.price - spotCny : null)}>
                {sge && spotCny ? signed(sge.price - spotCny) : "—"}
              </b>
              <em />
            </div>
            <div className="bench-row static">
              <span>{t.usdcny}</span>
              <b>{fmt(fx?.price, 4)}</b>
              <em />
            </div>
          </section>

          <section className="card rank">
            <div className="cardhead">
              <h2>{t.ranking}</h2>
              <span className="hint" title={t.rankingHint}>
                {t.units.cny} ⓘ
              </span>
            </div>
            {ranked.length < 2 ? (
              <p className="empty">{t.notEnough}</p>
            ) : (
              <ol>
                {ranked.map((r, i) => {
                  const p = r.quote!.price;
                  return (
                    <li key={r.market}>
                      <button
                        className={held.includes(r.market) ? "mine" : ""}
                        onClick={() => open(r.market)}
                        title={`${clock(stampOf(r))} ${r.quote!.published ? t.quoted : t.observed}`}
                      >
                        <span className="rank-name">
                          {t.short[r.market]}
                          {i === 0 && <em className="tag">{t.lowest}</em>}
                        </span>
                        <span className="bar">
                          <i
                            style={{ width: `${hi > lo ? 8 + ((p - lo) / (hi - lo)) * 92 : 8}%` }}
                          />
                        </span>
                        <b>{fmt(p)}</b>
                        <small>{i === 0 ? "" : "+" + fmt(p - lo)}</small>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
