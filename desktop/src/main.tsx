import "./style.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BANKS, BENCHMARKS, FX, useSeriesMap, useSnapshot } from "./data";
import { Detail } from "./Detail";
import { Overview } from "./Overview";
import { SettingsPage } from "./SettingsPage";
import { Sidebar, Ticker, type Page } from "./Shell";
import { SettingsContext, useSettingsState } from "./store";

const ALL = [...BANKS, ...BENCHMARKS, FX];

function App() {
  const state = useSettingsState();
  const [settings, update] = state;
  const { data, error, tick, command } = useSnapshot();
  const series = useSeriesMap(ALL, tick);
  const [page, go] = useState<Page>({ kind: "overview" });
  const open = (id: string) => {
    go({ kind: "market", id });
    window.scrollTo({ top: 0 });
  };

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
              <Detail market={page.id} data={data} tick={tick} command={command} />
            )}
            {page.kind === "settings" && <SettingsPage data={data} command={command} />}
          </article>
        </div>
      </main>
    </SettingsContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
