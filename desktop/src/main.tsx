import "./style.css";
import { Chart } from "./Chart";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

const names: Record<string, string> = {
  icbc_acc_gold_buy: "工行积存金",
  cmb_gold_account_buy: "招行黄金账户",
  jd_minsheng_gold: "民生积存金（京东）",
  jd_zheshang_gold: "浙商积存金（京东）",
  ccb_gold_accumulation: "建行积存金",
  uob_sgd_gold_savings: "大华黄金储蓄账户",
  sge_au9999: "上金所 Au99.99",
  xauusd_live_proxy: "国际现货黄金",
  usd_cny: "美元兑人民币",
};
type Quote = {
  price: number;
  redemption: number | null;
  source: string;
  observed: number;
  published: number | null;
  daily: boolean;
};
type Reading = {
  market: string;
  quote: Quote | null;
  status: string;
  detail: string | null;
};
type Snapshot = {
  chart: [string, number];
  legacy_alert: string | null;
  readings: Reading[];
  pinned: string;
  limits: Record<string, number>;
  storage_error: string | null;
  last_alert: { market: string; price: number; time: number } | null;
};
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  count: number;
};
const time = (epoch: number) =>
  new Date(epoch * 1000).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });
function App() {
  const [data, setData] = useState<Snapshot>();
  const [selected, select] = useState("");
  const [editing, edit] = useState(false);
  const [seriesMarket, setSeriesMarket] = useState("");
  const [bars, setBars] = useState<Candle[]>([]);
  const [mode, seconds] = data?.chart ?? ["original", 60];
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let generation = 0;
    async function refresh() {
      const request = ++generation;
      try {
        const next = await invoke<Snapshot>("snapshot");
        const series = await invoke<Candle[]>("history", {
          market: selected || next.pinned,
          seconds: next.chart[1],
          mode: next.chart[0],
        });
        if (active && request === generation) {
          setData(next);
          setSeriesMarket(selected || next.pinned);
          setBars(series);
          setError("");
        }
      } catch (e) {
        if (active && request === generation) setError(String(e));
      }
    }
    const subscription = listen("market-changed", () => {
      if (active && !document.hidden) void refresh();
    });
    void subscription
      .then(() => {
        if (active) void refresh();
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", resume);
      void subscription.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [selected]);
  async function command(name: string, args: Record<string, unknown>) {
    try {
      await invoke(name, args);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  const market = selected || data?.pinned || "icbc_acc_gold_buy";
  const reading = data?.readings.find(r => r.market === market);
  const q = reading?.quote;
  const unit = (id: string) => id === "uob_sgd_gold_savings" ? "新元/克" : id === "xauusd_live_proxy" ? "美元/盎司" : "元/克";
  const benchmarks = ["sge_au9999", "xauusd_live_proxy"];
  const limit = data?.limits[market];
  return <main>
    <aside><div className="brand"><img src={new URL("../src-tauri/icons/icon.png", import.meta.url).href} alt="" />Troy</div>
    {[false,true].map(group => <section key={String(group)}><h3>{group ? "市场基准" : "银行积存金"}</h3>
      {Object.keys(names).filter(id => id !== "usd_cny" && benchmarks.includes(id) === group).map(id => {
        const row = data?.readings.find(r => r.market === id);
        return <button key={id} className="watch" aria-pressed={market === id} onClick={() => {select(id);edit(false);}}>
          <span>{names[id]}</span><b>{row?.quote?.price.toFixed(2) ?? "—"}</b></button>;
      })}</section>)}
    </aside>
    <article><header><span>黄金行情</span><span>北京时间{q ? " · " + time(q.observed) + " 采集" : ""}</span></header>
      {(error || data?.storage_error) && <p role="alert">{error || data?.storage_error}</p>}
      <section className="quote"><div className="headline"><h1>{names[market]}</h1><small title={reading?.detail ?? ""}>{reading?.status ?? "读取中"}</small></div>
        <div className="price">{q?.price.toFixed(2) ?? "—"} <em>{unit(market)}</em></div>
        <div className="source">{q?.source ?? "等待报价"}{q?.published ? " · " + time(q.published) + " 报价" : ""}{q?.redemption != null ? "　赎回 " + q.redemption.toFixed(2) : ""}</div>
        <div className="actions"><button disabled={!data || data.pinned === market} onClick={() => command("pin",{market})}>{data?.pinned === market ? "✓ 已固定" : "固定到"}{navigator.platform.includes("Mac") ? "菜单栏" : "托盘"}</button>
        <button disabled={!data} aria-expanded={editing} onClick={() => edit(!editing)}>{limit ? "到价提醒 ≤ " + limit.toFixed(2) : "设置到价提醒"}</button></div>
        {editing && <form key={market} onSubmit={async e => {e.preventDefault(); const value = new FormData(e.currentTarget).get("target"); if(await command("set_limit",{market,target:value ? Number(value) : null})) edit(false);}}>
        <label>跌至 <input autoFocus name="target" aria-label="提醒价格" type="number" min=".01" step=".01" defaultValue={limit} placeholder="目标价"/> {unit(market)}</label><button>保存</button>{limit && <button type="button" onClick={async () => {if(await command("set_limit",{market,target:null})) edit(false);}}>关闭提醒</button>}</form>}
      </section>
      <section className="chart"><div className="charthead"><div><h2>分钟行情</h2><p>最近 30 分钟</p></div><div className="controls"><select aria-label="价格口径" value={mode} onChange={e => command("set_chart",{mode:e.target.value,seconds})}>
        <option value="original">原始报价</option><option value="yuan_per_gram">人民币元/克</option><option value="relative">首笔 = 100</option></select>
        <div className="segments">{[60,300].map(n => <button key={n} aria-pressed={seconds === n} onClick={() => command("set_chart",{mode,seconds:n})}>{n/60} 分</button>)}</div></div></div>
        <Chart bars={market === seriesMarket ? bars : []} seconds={seconds} unit={mode === "relative" ? "指数" : mode === "yuan_per_gram" ? "元/克" : unit(market)} empty={market === "uob_sgd_gold_savings" && mode === "yuan_per_gram" ? "暂无新元兑人民币汇率" : "等待此时段的报价采样"}/>
      </section>
      <footer>{data?.last_alert ? "最近提醒 · "+time(data.last_alert.time)+"　"+names[data.last_alert.market]+" "+data.last_alert.price.toFixed(2) : data?.legacy_alert}</footer>
    </article></main>;
}
createRoot(document.getElementById("root")!).render(<App />);
