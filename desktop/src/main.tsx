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
type Candle = {
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
          market: next.pinned,
          seconds: next.chart[1],
          mode: next.chart[0],
        });
        if (active && request === generation) {
          setData(next);
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
  }, []);
  async function command(name: string, args: Record<string, unknown>) {
    try {
      await invoke(name, args);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <main>
      <h1>Troy</h1>
      {(error || data?.storage_error) && (
        <p role="alert">{error || data?.storage_error}</p>
      )}
      <table>
        <caption>黄金行情</caption>
        <thead>
          <tr>
            {[
              "品种",
              "报价",
              "赎回价",
              "来源与状态",
              "菜单栏 / 托盘",
              "到价提醒",
            ].map((t) => (
              <th key={t}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.readings
            .filter((r) => r.market !== "usd_cny")
            .map((r) => (
              <tr key={r.market}>
                <th>{names[r.market]}</th>
                <td>
                  {r.quote?.price.toFixed(2) ?? "—"}{" "}
                  {r.market === "xauusd_live_proxy"
                    ? "美元/盎司"
                    : r.market === "uob_sgd_gold_savings"
                      ? "新元/克"
                      : "元/克"}
                </td>
                <td>{r.quote?.redemption?.toFixed(2) ?? "—"}</td>
                <td title={r.detail ?? r.quote?.source}>
                  {r.status}
                  <br />
                  {r.quote?.source}
                  {r.quote?.published && (
                    <small> · {time(r.quote.published)}</small>
                  )}
                </td>
                <td>
                  <button
                    disabled={data.pinned === r.market}
                    onClick={() => command("pin", { market: r.market })}
                  >
                    {data.pinned === r.market ? "已固定" : "固定"}
                  </button>
                </td>
                <td>
                  <form
                    key={data.limits[r.market] ?? "off"}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = new FormData(e.currentTarget).get("target");
                      void command("set_limit", {
                        market: r.market,
                        target: v ? Number(v) : null,
                      });
                    }}
                  >
                    <input
                      aria-label={names[r.market] + "目标价"}
                      name="target"
                      type="number"
                      step=".01"
                      min=".01"
                      defaultValue={data.limits[r.market] ?? ""}
                      placeholder="关闭"
                      style={{ width: "6em" }}
                    />
                    <button>保存</button>
                  </form>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {data?.last_alert && (
        <p>
          最近提醒 · {time(data.last_alert.time)}{" "}
          {names[data.last_alert.market]} {data.last_alert.price.toFixed(2)}
        </p>
      )}
      {!data?.last_alert && data?.legacy_alert && <p>{data.legacy_alert}</p>}
      {data?.pinned === "uob_sgd_gold_savings" && mode === "yuan_per_gram" && (
        <p>暂无新元兑人民币汇率，可查看原始报价或相对走势。</p>
      )}
      <h2>{data && names[data.pinned]} · 最近 30 分钟</h2>
      <select
        aria-label="价格口径"
        value={mode}
        onChange={(e) =>
          command("set_chart", { mode: e.target.value, seconds })
        }
      >
        <option value="original">原始报价</option>
        <option value="yuan_per_gram">人民币元/克</option>
        <option value="relative">首笔 = 100</option>
      </select>
      <select
        aria-label="采样周期"
        value={seconds}
        onChange={(e) =>
          command("set_chart", { mode, seconds: Number(e.target.value) })
        }
      >
        <option value={60}>1 分钟</option>
        <option value={300}>5 分钟</option>
      </select>
      <table>
        <thead>
          <tr>
            {["北京时间", "开", "高", "低", "收", "采样数"].map((t) => (
              <th key={t}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.time}>
              <td>{time(b.time)}</td>
              {[b.open, b.high, b.low, b.close].map((p, i) => (
                <td key={i}>{p.toFixed(2)}</td>
              ))}
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
