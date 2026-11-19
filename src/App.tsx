import { useUpdates } from "@/hooks/useUpdates";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
import { useEffect, useState } from "react";
import { Sidebar, type Page } from "@/components/Sidebar";
import { Ticker } from "@/components/Ticker";
import { useSeriesMap } from "@/hooks/useSeriesMap";
import { useSnapshot } from "@/hooks/useSnapshot";
import { ALL_MARKETS } from "@/lib/markets";
import { MarketDetail } from "@/pages/MarketDetail";
import { Overview } from "@/pages/Overview";
import { Settings } from "@/pages/Settings";
import { SettingsContext, useSettingsState } from "@/store/settings";

export function App() {
  const state = useSettingsState();
  const [settings, update] = state;
  const updates = useUpdates(settings.autoUpdates);
  const [later, setLater] = useState<string | null>(null);
  const { data, error, tick, run } = useSnapshot();
  const series = useSeriesMap(ALL_MARKETS, tick);
  const [page, go] = useState<Page>({ kind: "overview" });
  const open = (id: string) => {
    go({ kind: "market", id });
    window.scrollTo({ top: 0 });
  };

  // ⌘/Ctrl + \ toggles the sidebar, + , opens settings, + 1 returns to the overview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "\\") update({ collapsed: !settings.collapsed });
      else if (e.key === ",") go({ kind: "settings" });
      else if (e.key === "1") go({ kind: "overview" });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.collapsed, update]);

  return (
    <SettingsContext.Provider value={state}>
      <main className={settings.collapsed ? "collapsed" : ""}>
        <Sidebar data={data} page={page} go={go} />
        <div className="content">
          {settings.ticker && <Ticker data={data} series={series} open={open} />}
          <article>
            {updates.result?.available &&
              updates.result.available !== later &&
              page.kind !== "settings" && (
                <UpdateNotice
                  version={updates.result.available}
                  download={updates.download}
                  error={updates.error}
                  dismiss={() => setLater(updates.result!.available)}
                />
              )}
            {(error || data?.storage_error) && <p role="alert">{error || data?.storage_error}</p>}
            {page.kind === "overview" && (
              <Overview
                data={data}
                series={series}
                pin={(id) => void run(api.pin(id))}
                open={open}
                openSettings={() => go({ kind: "settings" })}
              />
            )}
            {page.kind === "market" && (
              <MarketDetail market={page.id} data={data} tick={tick} run={run} />
            )}
            {page.kind === "settings" && <Settings data={data} run={run} updates={updates} />}
          </article>
        </div>
      </main>
    </SettingsContext.Provider>
  );
}

function UpdateNotice({
  version,
  download,
  dismiss,
  error,
}: {
  version: string;
  download: () => Promise<void>;
  dismiss: () => void;
  error: string;
}) {
  const t = useT();
  return (
    <div className="update-notice" role="status">
      <strong>{t.newVersion(version)}</strong>
      {error && <span title={error}>{t.updateError}</span>}
      <button className="primary" onClick={() => void download()}>
        {t.downloadUpdate}
      </button>
      <button className="ghost" onClick={dismiss}>
        {t.later}
      </button>
    </div>
  );
}
