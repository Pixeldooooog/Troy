import { api } from "@/lib/api";
import { useT } from "@/i18n";
import { useEffect, useState } from "react";
import { Sidebar, type Page } from "@/components/Sidebar";
import { Ticker } from "@/components/Ticker";
import { useOverview } from "@/hooks/useOverview";
import { useSnapshot } from "@/hooks/useSnapshot";
import { useUpdate } from "@/hooks/useUpdate";
import { MarketDetail } from "@/pages/MarketDetail";
import { Overview } from "@/pages/Overview";
import { Settings } from "@/pages/Settings";
import { SettingsContext, useSettingsState } from "@/store/settings";

export function App() {
  const { data, error, tick, run, report } = useSnapshot();
  const state = useSettingsState(report);
  const [settings, update] = state;
  const series = useOverview(tick);
  const updates = useUpdate(settings?.autoUpdates ?? false);
  const [later, setLater] = useState<string | null>(null);
  const available = updates.result?.available;
  const [page, go] = useState<Page>({ kind: "overview" });
  const open = (id: string) => {
    go({ kind: "market", id });
    window.scrollTo({ top: 0 });
  };

  // ⌘/Ctrl + \ toggles the sidebar, + , opens settings, + 1 returns to the overview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !settings) return;
      if (e.key === "\\") update({ collapsed: !settings.collapsed });
      else if (e.key === ",") go({ kind: "settings" });
      else if (e.key === "1") go({ kind: "overview" });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings, update]);

  // Settings come from SQLite; render once they are in so nothing flashes.
  if (!settings) return error ? <p role="alert">{error}</p> : null;

  return (
    <SettingsContext.Provider value={[settings, update]}>
      <main className={settings.collapsed ? "collapsed" : ""}>
        <Sidebar
          data={data}
          series={series}
          page={page}
          go={go}
          updateVersion={available?.version}
        />
        <div className="content">
          {settings.ticker && <Ticker data={data} series={series} open={open} />}
          <article className={page.kind === "overview" ? "overview-page" : undefined}>
            {available && available.version !== later && page.kind !== "settings" && (
              <UpdateNotice
                version={available.version}
                download={updates.download}
                error={updates.error}
                dismiss={() => setLater(available.version)}
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
              <MarketDetail market={page.id} data={data} series={series} tick={tick} run={run} />
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
