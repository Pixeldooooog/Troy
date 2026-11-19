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
            {page.kind === "settings" && <Settings data={data} run={run} />}
          </article>
        </div>
      </main>
    </SettingsContext.Provider>
  );
}
