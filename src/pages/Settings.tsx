import { useEffect, useState, type ReactNode } from "react";
import type { Run } from "@/hooks/useSnapshot";
import type { useUpdate } from "@/hooks/useUpdate";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { BANKS, BENCHMARKS, unitOf } from "@/lib/markets";
import type { Mode, Snapshot } from "@/lib/types";
import { useSettings, type Holding } from "@/store/settings";

function Segmented<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: [V, string][];
  onChange: (v: V) => void;
}) {
  return (
    <div className="segments" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="set-row">
    <div>
      <div className="set-label">{label}</div>
      {hint && <div className="set-hint">{hint}</div>}
    </div>
    <div className="set-control">{children}</div>
  </div>
);

const num = (v: string) => (v === "" ? undefined : Number(v));

export function Settings({
  data,
  run,
  updater,
}: {
  data?: Snapshot;
  run: Run;
  updater: ReturnType<typeof useUpdate>;
}) {
  const t = useT();
  const [s, update] = useSettings();
  const mac = navigator.platform.includes("Mac");
  const mod = mac ? "⌘" : "Ctrl+";
  const [mode, seconds]: [Mode, number] = data?.chart ?? ["original", 60];
  const [autostart, setAutostart] = useState<boolean>();
  useEffect(() => {
    api
      .autostart()
      .then(setAutostart)
      .catch(() => {});
  }, []);
  const u = updater.state;
  const setHolding = (id: string, patch: Holding) =>
    update({ holdings: { ...s.holdings, [id]: { ...s.holdings[id], ...patch } } });

  return (
    <>
      <header className="topbar">
        <div className="title">
          <h1>{t.settings}</h1>
        </div>
      </header>
      <div className="settings">
        <section className="card set-card">
          <h2>{t.general}</h2>
          <Row label={t.language}>
            <Segmented
              value={s.lang}
              options={[
                ["zh", "中文"],
                ["en", "English"],
              ]}
              onChange={(lang) => update({ lang })}
            />
          </Row>
          <Row label={t.appearance}>
            <Segmented
              value={s.theme}
              options={[
                ["system", t.themeSystem],
                ["light", t.themeLight],
                ["dark", t.themeDark],
              ]}
              onChange={(theme) => update({ theme })}
            />
          </Row>
          <Row label={t.colorConvention}>
            <Segmented
              value={s.upDown}
              options={[
                ["red", t.redUp],
                ["green", t.greenUp],
              ]}
              onChange={(upDown) => update({ upDown })}
            />
          </Row>
          <Row label={t.showTicker}>
            <label className="switch">
              <input
                type="checkbox"
                checked={s.ticker}
                onChange={(e) => update({ ticker: e.target.checked })}
              />
              <i />
            </label>
          </Row>
          <Row label={t.autostart} hint={t.autostartHint}>
            <label className="switch">
              <input
                type="checkbox"
                disabled={autostart === undefined}
                checked={!!autostart}
                onChange={async (e) => {
                  const enabled = e.target.checked;
                  if (await run(api.setAutostart(enabled))) setAutostart(enabled);
                }}
              />
              <i />
            </label>
          </Row>
        </section>

        <section className="card set-card">
          <h2>{t.holdingsTitle}</h2>
          <p className="set-desc">{t.holdingsDesc}</p>
          <table className="hold-table">
            <thead>
              <tr>
                <th>{t.name}</th>
                <th>{t.held}</th>
                <th>{t.grams}</th>
                <th>{t.costPrice}</th>
              </tr>
            </thead>
            <tbody>
              {BANKS.map((id) => {
                const on = s.held.includes(id);
                const h = s.holdings[id] ?? {};
                return (
                  <tr key={id} className={on ? "" : "off"}>
                    <td>{t.markets[id]}</td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            update({ held: on ? s.held.filter((x) => x !== id) : [...s.held, id] })
                          }
                        />
                        <i />
                      </label>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        disabled={!on}
                        value={h.grams ?? ""}
                        placeholder="0"
                        onChange={(e) => setHolding(id, { grams: num(e.target.value) })}
                      />
                      <span className="suffix">g</span>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!on}
                        value={h.cost ?? ""}
                        placeholder="—"
                        onChange={(e) => setHolding(id, { cost: num(e.target.value) })}
                      />
                      <span className="suffix">{unitOf(id, t)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card set-card">
          <h2>{t.alertsSection}</h2>
          <p className="set-desc">{t.alertsDesc}</p>
          {[...BANKS, ...BENCHMARKS].map((id) => (
            <Row key={id} label={t.markets[id]}>
              <form
                className="inline-field"
                key={id + (data?.limits[id] ?? "")}
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = new FormData(e.currentTarget).get("v");
                  void run(api.setLimit(id, v ? Number(v) : null));
                }}
              >
                <input
                  name="v"
                  type="number"
                  min=".01"
                  step=".01"
                  defaultValue={data?.limits[id]}
                  placeholder={t.notSet}
                  onBlur={(e) => {
                    const v = e.currentTarget.value;
                    if ((v ? Number(v) : undefined) !== data?.limits[id])
                      e.currentTarget.form?.requestSubmit();
                  }}
                />
                <span className="suffix">{unitOf(id, t)}</span>
              </form>
            </Row>
          ))}
        </section>

        <section className="card set-card">
          <h2>{t.chartSection}</h2>
          <Row label={t.defaultMode}>
            <Segmented
              value={mode}
              options={[
                ["original", t.rawQuote],
                ["yuan_per_gram", t.cnyPerGram],
                ["relative", t.relative],
              ]}
              onChange={(m) => run(api.setChart(m, seconds))}
            />
          </Row>
          <Row label={t.interval}>
            <Segmented
              value={String(seconds) as "60" | "300"}
              options={[
                ["60", "1 " + t.min],
                ["300", "5 " + t.min],
              ]}
              onChange={(v) => run(api.setChart(mode, Number(v)))}
            />
          </Row>
        </section>

        <section className="card set-card">
          <h2>{t.menubarSection}</h2>
          <Row label={t.pinnedMarket}>
            <select value={data?.pinned ?? ""} onChange={(e) => run(api.pin(e.target.value))}>
              {[...BANKS, ...BENCHMARKS].map((id) => (
                <option key={id} value={id}>
                  {t.markets[id]}
                </option>
              ))}
            </select>
          </Row>
        </section>

        <section className="card set-card">
          <h2>{t.shortcuts}</h2>
          <Row label={t.shortcutOverview}>
            <kbd>{mod}1</kbd>
          </Row>
          <Row label={t.shortcutSidebar}>
            <kbd>{mod}\</kbd>
          </Row>
          <Row label={t.shortcutSettings}>
            <kbd>{mod},</kbd>
          </Row>
        </section>

        <section className="card set-card">
          <h2>{t.about}</h2>
          <p className="set-desc">{t.aboutDesc}</p>
          <Row label={t.version}>
            <span className="mono">{__APP_VERSION__}</span>
          </Row>
          <Row
            label={t.updates}
            hint={
              u.kind === "available"
                ? t.updateAvailable(u.update.version)
                : u.kind === "current"
                  ? t.upToDate
                  : u.kind === "checking"
                    ? t.checking
                    : u.kind === "installing"
                      ? t.installing
                      : u.kind === "error"
                        ? `${t.updateFailed}: ${u.message}`
                        : undefined
            }
          >
            {u.kind === "available" ? (
              <button className="primary" onClick={() => void updater.install()}>
                {t.installUpdate}
              </button>
            ) : (
              <button
                className="ghost"
                disabled={u.kind === "checking" || u.kind === "installing"}
                onClick={() => void updater.check()}
              >
                {t.checkUpdate}
              </button>
            )}
          </Row>
          {u.kind === "available" && u.update.notes && (
            <pre className="release-notes">{u.update.notes}</pre>
          )}
          {data?.storage_error && <p role="alert">{data.storage_error}</p>}
        </section>
      </div>
    </>
  );
}
