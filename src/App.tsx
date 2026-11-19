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
  const updater = useUpdate();
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
          page={page}
          go={go}
          updateVersion={
            updater.state.kind === "available" ? updater.state.update.version : undefined
          }
        />
        <div className="content">
          {settings.ticker && <Ticker data={data} series={series} open={open} />}
          <article>
            {(error || data?.storage_error) && <p role="alert">{error || data?.storage_error}</p>}
            {page.kind === "overview" && (
              <Overview
                data={data}
                series={series}
                open={open}
                openSettings={() => go({ kind: "settings" })}
              />
            )}
            {page.kind === "market" && (
              <MarketDetail market={page.id} data={data} tick={tick} run={run} />
            )}
            {page.kind === "settings" && <Settings data={data} run={run} updater={updater} />}
          </article>
        </div>
      </main>
    </SettingsContext.Provider>
  );
}
