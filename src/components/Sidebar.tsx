import { sourceTiming, statusLabel } from "@/lib/quoteTiming";
import { useState } from "react";
import logo from "@/assets/logo.png";
import { useT } from "@/i18n";
import { clock, fmt, signed, trendClass } from "@/lib/format";
import { BANKS, BENCHMARKS, FX, tone, unitOf } from "@/lib/markets";
import { dayChange } from "@/lib/portfolio";
import type { Snapshot, Trend } from "@/lib/types";
import { Sparkline } from "./charts/Sparkline";
import { en } from "@/i18n/en";
import { useSettings } from "@/store/settings";
import { icon } from "./Icons";

export type Page = { kind: "overview" } | { kind: "settings" } | { kind: "market"; id: string };

export function Sidebar({
  data,
  series,
  page,
  go,
  updateVersion,
}: {
  data?: Snapshot;
  series: Record<string, Trend>;
  page: Page;
  go: (p: Page) => void;
  /** Set when a newer public release is available. */
  updateVersion?: string;
}) {
  const t = useT();
  const [settings, update] = useSettings();
  const [list, setList] = useState("all");
  const { collapsed, held } = settings;
  const others = BANKS.filter((id) => !held.includes(id));
  const current = page.kind === "market" ? page.id : null;
  const row = (id: string) => {
    const r = data?.readings.find((x) => x.market === id);
    const live = r?.status === "live";
    const unit = unitOf(id, t);
    const change = dayChange(r?.quote, series[id]);
    const details = [
      t.markets[id],
      unit,
      r ? statusLabel(r, t) : t.waiting,
      r && sourceTiming(r, t),
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <button
        key={id}
        className="watch"
        aria-current={current === id || undefined}
        title={details}
        aria-label={details}
        onClick={() => go({ kind: "market", id })}
      >
        {collapsed ? (
          <span className="avatar">
            {en.short[id]}
            <i className={"dot " + tone(r?.status)} />
          </span>
        ) : (
          <>
            <span className="watch-text">
              <span className="watch-name">
                {t.short[id]}
                {id.startsWith("jd_") && <small className="watch-channel">JD</small>}
                {data?.pinned === id && <em className="pin">●</em>}
              </span>
              {!live && <i className={"dot " + tone(r?.status)} />}
            </span>
            <Sparkline
              bars={series[id]?.intraday ?? []}
              unit={unit}
              trend={change ? trendClass(change.abs) : undefined}
            />
            <span className="watch-quote">
              <b>{fmt(r?.quote?.price)}</b>
              <em className={trendClass(change?.pct)}>{change ? signed(change.pct) + "%" : "—"}</em>
            </span>
          </>
        )}
      </button>
    );
  };

  const fx = data?.readings.find((r) => r.market === FX)?.quote;
  const alert = data?.last_alert;
  const alertText = alert
    ? `${clock(alert.time, false)} · ${t.markets[alert.market]} ${fmt(alert.price)} ${unitOf(alert.market, t)} · ${t.target} ${fmt(alert.target)}`
    : data?.legacy_alert;
  return (
    <aside className={collapsed ? "collapsed" : ""}>
      <div className="side-top">
        {!collapsed && (
          <div className="brand">
            <img src={logo} alt="" />
            Troy
          </div>
        )}
        <button
          className="iconbtn"
          title={(collapsed ? t.expand : t.collapse) + "  ⌘\\"}
          aria-label={collapsed ? t.expand : t.collapse}
          onClick={() => {
            update({ collapsed: !collapsed });
          }}
        >
          {icon.sidebar}
        </button>
      </div>
      <nav>
        <button
          className="navitem"
          aria-current={page.kind === "overview" || undefined}
          title={collapsed ? t.overview : undefined}
          onClick={() => go({ kind: "overview" })}
        >
          {icon.overview}
          {!collapsed && <span>{t.overview}</span>}
        </button>

        <section>
          {!collapsed && (
            <select
              className="watchlist-picker"
              aria-label={t.watchlists}
              value={list}
              onChange={(e) => setList(e.target.value)}
            >
              <option value="all">{t.allQuotes}</option>
              <option value="held">{t.myGold}</option>
              <option value="other">{t.otherBanks}</option>
              <option value="bench">{t.benchmarks}</option>
            </select>
          )}
          {(list === "held"
            ? held
            : list === "other"
              ? others
              : list === "bench"
                ? BENCHMARKS
                : [...held, ...others, ...BENCHMARKS]
          ).map(row)}
          {!collapsed &&
            ((list === "held" && !held.length) || (list === "other" && !others.length)) && (
              <p className="empty">{t.emptyList}</p>
            )}
        </section>
      </nav>
      <div className="sidefoot">
        {!collapsed && (
          <div className="foot-quotes">
            {fx && (
              <span title={t.usdcny}>
                USD/CNY <b>{fx.price.toFixed(4)}</b>
              </span>
            )}
          </div>
        )}
        {updateVersion && (
          <button
            className="update-pill"
            title={t.updateAvailable(updateVersion)}
            onClick={() => go({ kind: "settings" })}
          >
            ↑{!collapsed && <span>{t.updateAvailable(updateVersion)}</span>}
          </button>
        )}
        <div className="foot-row">
          <button
            className="navitem"
            aria-current={page.kind === "settings" || undefined}
            aria-label={t.settings}
            title={t.settings}
            onClick={() => go({ kind: "settings" })}
          >
            {icon.settings}
            {!collapsed && <span>{t.settings}</span>}
          </button>
          {alertText && (
            <details className="last-alert">
              <summary className="iconbtn" title={t.lastAlert} aria-label={t.lastAlert}>
                {icon.bell}
              </summary>
              <div role="status">
                <b>{t.lastAlert}</b>
                {alertText}
              </div>
            </details>
          )}
        </div>
      </div>
    </aside>
  );
}
