import { sourceTiming, statusLabel } from "@/lib/quoteTiming";
import { useState } from "react";
import logo from "@/assets/logo.png";
import { useT } from "@/i18n";
import { clock, fmt } from "@/lib/format";
import { BANKS, BENCHMARKS, FX, tone } from "@/lib/markets";
import type { Snapshot } from "@/lib/types";
import { useSettings } from "@/store/settings";
import { icon } from "./Icons";

export type Page = { kind: "overview" } | { kind: "settings" } | { kind: "market"; id: string };

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
        title={
          r
            ? [t.markets[id], statusLabel(r, t), sourceTiming(r, t)].filter(Boolean).join(" · ")
            : t.markets[id]
        }
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
              <span
                className={"check" + (isHeld ? " on" : "")}
                role="checkbox"
                aria-checked={isHeld}
              >
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
            <img src={logo} alt="" />
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
          aria-label={t.settings}
          title={t.settings}
          onClick={() => go({ kind: "settings" })}
        >
          {icon.settings}
          {!collapsed && <span>{t.settings}</span>}
        </button>
      </div>
    </aside>
  );
}
