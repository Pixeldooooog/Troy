import { useState } from "react";
import {
  BANKS,
  BENCHMARKS,
  FX,
  clock,
  fmt,
  signed,
  tone,
  trendClass,
  type Series,
  type Snapshot,
} from "./data";
import { useT } from "./i18n";
import { useSettings } from "./store";

export type Page = { kind: "overview" } | { kind: "settings" } | { kind: "market"; id: string };

const icon = {
  overview: (
    <svg viewBox="0 0 16 16" aria-hidden>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </svg>
  ),
  sidebar: (
    <svg viewBox="0 0 16 16" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M10.5 2.5l3 3L6 13H3v-3z" />
    </svg>
  ),
};

/** Scrolling quote strip; pauses on hover and stays still with reduced motion. */
export function Ticker({
  data,
  series,
  open,
}: {
  data?: Snapshot;
  series: Record<string, Series>;
  open: (id: string) => void;
}) {
  const t = useT();
  const items = [...BANKS, ...BENCHMARKS, FX].map((id) => {
    const q = data?.readings.find((r) => r.market === id)?.quote;
    const prev = series[id]?.prevClose;
    return { id, price: q?.price, pct: q && prev ? (q.price / prev - 1) * 100 : null };
  });
  const row = (copy: number) =>
    items.map((it) => (
      <button
        key={copy + it.id}
        tabIndex={copy ? -1 : 0}
        aria-hidden={copy ? true : undefined}
        disabled={it.id === FX}
        onClick={() => open(it.id)}
      >
        <span>{t.markets[it.id]}</span>
        <b>{fmt(it.price, it.id === FX ? 4 : 2)}</b>
        <em className={trendClass(it.pct)}>
          {it.pct == null ? "—" : (it.pct > 0 ? "▲ " : it.pct < 0 ? "▼ " : "") + signed(it.pct).replace(/^[+−]/, "") + "%"}
        </em>
      </button>
    ));
  return (
    <div className="ticker" role="marquee" aria-label="quotes">
      <div className="ticker-track">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}

export function Sidebar({
  data,
  page,
  go,
}: {
  data?: Snapshot;
  page: Page;
  go: (p: Page) => void;
}) {
  const t = useT();
  const [settings, update] = useSettings();
  const [editing, setEditing] = useState(false);
  const { collapsed, held } = settings;
  const others = BANKS.filter((id) => !held.includes(id));
  const current = page.kind === "market" ? page.id : null;
  const toggleHeld = (id: string) =>
    update({ held: held.includes(id) ? held.filter((x) => x !== id) : [...held, id] });

  const row = (id: string) => {
    const r = data?.readings.find((x) => x.market === id);
    const isHeld = held.includes(id);
    const bank = BANKS.includes(id);
    return (
      <button
        key={id}
        className="watch"
        aria-current={current === id || undefined}
        title={collapsed ? `${t.markets[id]}  ${fmt(r?.quote?.price)}` : r ? t.status[r.status] : undefined}
        onClick={() => (editing && bank ? toggleHeld(id) : go({ kind: "market", id }))}
      >
        {collapsed ? (
          <span className="avatar">
            {t.short[id]}
            <i className={"dot " + tone(r?.status)} />
          </span>
        ) : (
          <>
            <i className={"dot " + tone(r?.status)} />
            <span className="watch-name">
              {t.markets[id]}
              {data?.pinned === id && <em className="pin">●</em>}
            </span>
            {editing && bank ? (
              <span className={"check" + (isHeld ? " on" : "")} role="checkbox" aria-checked={isHeld}>
                {isHeld ? "✓" : ""}
              </span>
            ) : (
              <b>{fmt(r?.quote?.price)}</b>
            )}
          </>
        )}
      </button>
    );
  };

  const fx = data?.readings.find((r) => r.market === FX)?.quote;
  return (
    <aside className={collapsed ? "collapsed" : ""}>
      <div className="side-top">
        {!collapsed && (
          <div className="brand">
            <img src={new URL("../src-tauri/icons/icon.png", import.meta.url).href} alt="" />
            Troy
          </div>
        )}
        <button
          className="iconbtn"
          title={(collapsed ? t.expand : t.collapse) + "  ⌘\\"}
          aria-label={collapsed ? t.expand : t.collapse}
          onClick={() => update({ collapsed: !collapsed })}
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
            <h3>
              {t.myGold}
              <button
                className={"iconbtn small" + (editing ? " active" : "")}
                title={t.editHeld}
                aria-pressed={editing}
                onClick={() => setEditing(!editing)}
              >
                {editing ? t.done : icon.edit}
              </button>
            </h3>
          )}
          {held.map(row)}
          {editing && !collapsed && others.map(row)}
        </section>
        {!editing && others.length > 0 && (
          <section>
            {!collapsed && <h3>{t.otherBanks}</h3>}
            {others.map(row)}
          </section>
        )}
        <section>
          {!collapsed && <h3>{t.benchmarks}</h3>}
          {BENCHMARKS.map(row)}
        </section>
      </nav>
      <div className="sidefoot">
        {!collapsed && fx && (
          <div className="kv">
            <span>{t.usdcny}</span>
            <b>{fx.price.toFixed(4)}</b>
          </div>
        )}
        {!collapsed && (data?.last_alert || data?.legacy_alert) && (
          <div className="kv col">
            <span>{t.lastAlert}</span>
            <b>
              {data.last_alert
                ? `${clock(data.last_alert.time, false)} ${t.short[data.last_alert.market] ?? ""} ${data.last_alert.price.toFixed(2)}`
                : data.legacy_alert}
            </b>
          </div>
        )}
        <button
          className="navitem"
          aria-current={page.kind === "settings" || undefined}
          title={collapsed ? t.settings : undefined}
          onClick={() => go({ kind: "settings" })}
        >
          {icon.settings}
          {!collapsed && <span>{t.settings}</span>}
        </button>
      </div>
    </aside>
  );
}
