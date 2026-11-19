import { CompareChart, type Line } from "@/components/charts/CompareChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { useT } from "@/i18n";
import { clock, fmt, money, signed, trendClass } from "@/lib/format";
import { FX, OUNCE, SGE, SPOT, comparableBanks, stampOf, tone, unitOf } from "@/lib/markets";
import { dayChange as changeOf, positionPnl, premiumOverSge, summarize } from "@/lib/portfolio";
import type { Snapshot, Trend } from "@/lib/types";
import { useSettings } from "@/store/settings";

const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

export function Overview({
  data,
  series,
  open,
  openSettings,
}: {
  data?: Snapshot;
  series: Record<string, Trend>;
  open: (id: string) => void;
  openSettings: () => void;
}) {
  const t = useT();
  const [settings] = useSettings();
  const readings = data?.readings ?? [];
  const quote = (id: string) => readings.find((r) => r.market === id)?.quote ?? null;
  const reading = (id: string) => readings.find((r) => r.market === id);
  const dayChange = (id: string) => changeOf(quote(id), series[id]);
  const sge = quote(SGE),
    spot = quote(SPOT),
    fx = quote(FX);
  const spotCny = spot && fx ? (spot.price * fx.price) / OUNCE : null;
  const held = settings.held;
  const newest = Math.max(0, ...readings.map((r) => r.quote?.observed ?? 0));

  const summary = summarize(held, settings.holdings, quote, dayChange);

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

      {summary.count > 0 ? (
        <section className="summary">
          <div>
            <span>{t.marketValue}</span>
            <b title={t.valueHint}>{money(summary.value)}</b>
            <small>
              {t.holdingGrams} {fmt(summary.grams, 3)} g
            </small>
          </div>
          <div>
            <span>{t.floatingPnl}</span>
            <b className={trendClass(summary.pnl)}>{money(summary.pnl, true)}</b>
            <small className={trendClass(summary.pnl)}>
              {summary.pnlPct != null ? signed(summary.pnlPct) + "%" : t.notSet}
            </small>
          </div>
          <div>
            <span>{t.todayPnl}</span>
            <b className={trendClass(summary.today)}>{money(summary.today, true)}</b>
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
            const premium = premiumOverSge(id, q, sge);
            const ownPnl = positionPnl(h, q);
            return (
              <button key={id} className="card holding" onClick={() => open(id)}>
                <div className="hold-head">
                  <i className="swatch" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="hold-name">{t.markets[id]}</span>
                  <i className={"dot " + tone(r?.status)} title={r ? t.status[r.status] : ""} />
                </div>
                <div className="hold-price">
                  <b>{fmt(q?.price)}</b>
                  <em>{unitOf(id, t)}</em>
                </div>
                <div
                  className={"change " + trendClass(d?.abs)}
                  title={d ? t.basis[d.basis] : t.dailyHint}
                >
                  {d ? `${signed(d.abs)}  ${signed(d.pct)}%` : t.daily + " —"}
                </div>
                <Sparkline
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
            );
          })}
        </section>
      )}

      <div className="ov-grid">
        <section className="card">
          <div className="cardhead">
            <h2>{t.trend}</h2>
            <span className="hint">{t.trendHint}</span>
          </div>
          <CompareChart lines={lines} empty={t.noSamples} />
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
                    <small>{unitOf(id, t)}</small>
                  </span>
                  <b>{fmt(q?.price)}</b>
                  <em className={trendClass(d?.pct)} title={d ? t.basis[d.basis] : t.dailyHint}>
                    {d ? signed(d.pct) + "%" : "—"}
                  </em>
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
