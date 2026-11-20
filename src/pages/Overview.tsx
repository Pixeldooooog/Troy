import { sourceTiming, statusLabel } from "@/lib/quoteTiming";
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
  pin,
}: {
  data?: Snapshot;
  series: Record<string, Trend>;
  open: (id: string) => void;
  openSettings: () => void;
  pin: (id: string) => void;
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
  const fxStatus = reading(FX)?.status;
  const rate = fx && (fxStatus === "live" || fxStatus === "delayed") ? fx.price : null;
  const usable = (id: string) => ["live", "delayed"].includes(reading(id)?.status ?? "");
  const spotCny = spot && usable(SPOT) && rate ? (spot.price * rate) / OUNCE : null;
  const spread = sge && usable(SGE) && spotCny != null ? sge.price - spotCny : null;
  const statusOf = (id: string) => {
    const r = reading(id);
    return r ? statusLabel(r, t) : t.status.waiting;
  };
  const conversionNote = !rate
    ? t.usdcny + " · " + statusOf(FX)
    : spotCny == null
      ? t.short[SPOT] + " · " + statusOf(SPOT)
      : fx?.daily
        ? t.dailyFxReference
        : "";
  const held = settings.held;
  const pinLocation = navigator.platform.includes("Mac") ? t.menubar : t.tray;
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
      color: "var(--sge-line)",
      bars: series[SGE]?.intraday ?? [],
      dash: "7 4",
    },
    {
      id: SPOT,
      label: t.short[SPOT],
      color: "var(--spot-line)",
      bars: series[SPOT]?.intraday ?? [],
      dash: "1 4",
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
          <p className="banner">
            {t.addHoldings}
            <button onClick={openSettings}>{t.goFill}</button>
          </p>
        )
      )}

      <section className="card trend">
        <div className="cardhead">
          <h2>{t.trend}</h2>
        </div>
        <CompareChart lines={lines} cnyPerUsd={rate} />
      </section>

      {held.length === 0 ? (
        <section className="card emptystate">
          <p>{t.noHeld}</p>
          <button className="primary" onClick={openSettings}>
            {t.chooseHeld}
          </button>
        </section>
      ) : (
        <section className="holdings">
          {held.map((id) => {
            const q = quote(id),
              r = reading(id),
              d = dayChange(id),
              h = settings.holdings[id];
            const premium = premiumOverSge(id, q, sge);
            const ownPnl = positionPnl(h, q);
            return (
              <div key={id} className="holding-wrap">
                <button className="card holding" onClick={() => open(id)}>
                  <div className="hold-head">
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
                  <div
                    className={"change " + trendClass(d?.abs)}
                    title={d ? t.basis[d.basis] : t.dailyHint}
                  >
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
        <section className="card bench">
          <div className="cardhead">
            <h2>{t.benchmarks}</h2>
          </div>
          {[SGE, SPOT].map((id) => {
            const q = quote(id),
              d = dayChange(id),
              r = reading(id);
            return (
              <button key={id} className="bench-row" onClick={() => open(id)}>
                <BenchName
                  name={t.markets[id]}
                  note={[unitOf(id, t), id === SGE && r ? statusLabel(r, t) : ""]}
                />
                <b>{fmt(q?.price)}</b>
                <em
                  className={"badge " + trendClass(d?.pct)}
                  title={d ? t.basis[d.basis] : t.dailyHint}
                >
                  {d ? signed(d.pct) + "%" : "—"}
                </em>
              </button>
            );
          })}
          <div className="bench-row static">
            <BenchName name={t.intlCny} note={[t.units.cny, conversionNote]} />
            <b>{fmt(spotCny)}</b>
            <em className="badge" />
          </div>
          <div className="bench-row static" title={t.domesticPremiumHint}>
            <BenchName
              name={t.domesticPremium}
              note={[
                t.units.cny,
                spotCny != null && spread == null
                  ? t.short[SGE] + " · " + statusOf(SGE)
                  : conversionNote,
              ]}
            />
            <b className={trendClass(spread)}>{spread == null ? "—" : signed(spread)}</b>
            <em className="badge" />
          </div>
          <div className="bench-row static">
            <BenchName name={t.usdcny} note={[fxStatus === "live" ? "" : statusOf(FX)]} />
            <b>{fmt(fx?.price, 4)}</b>
            <em className="badge" />
          </div>
        </section>

        <section className="card rank">
          <div className="cardhead">
            <h2>{t.ranking}</h2>
            <span className="hint" title={t.rankingHint}>
              {t.units.cny}
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
                      <span className="rank-name">{t.short[r.market]}</span>
                      <span className="bar">
                        <i style={{ width: `${hi > lo ? 8 + ((p - lo) / (hi - lo)) * 92 : 8}%` }} />
                      </span>
                      <b>{fmt(p)}</b>
                      <small>{i === 0 ? t.lowest : "+" + fmt(p - lo)}</small>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

/** Benchmark name with a muted second line for unit and status notes. */
function BenchName({ name, note }: { name: string; note: string[] }) {
  const text = note.filter(Boolean).join(" · ");
  return (
    <span className="bench-name" title={text ? name + " · " + text : name}>
      {name}
      {text && <small>{text}</small>}
    </span>
  );
}
