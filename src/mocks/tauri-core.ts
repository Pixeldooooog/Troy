/**
 * Stand-in for @tauri-apps/api/core in `npm run dev:mock`, so the UI can be
 * developed in a browser without the Rust core. Prices are random walks.
 */
import type { Candle, Reading, Snapshot } from "@/lib/types";
import { notify } from "./tauri-event";

const now = () => Math.floor(Date.now() / 1000);
const quote = (price: number, redemption: number | null, source: string, published = true) => ({
  price,
  redemption,
  source,
  observed: now() - 5,
  published: published ? now() - 25 : null,
  daily: false,
});
const readings: Reading[] = [
  {
    market: "icbc_acc_gold_buy",
    quote: quote(938.42, 934.12, "工商银行官网"),
    status: "有效",
    detail: null,
  },
  {
    market: "cmb_gold_account_buy",
    quote: quote(938.9, 934.6, "招商银行"),
    status: "有效",
    detail: null,
  },
  {
    market: "jd_minsheng_gold",
    quote: quote(937.15, null, "京东金融", false),
    status: "有效",
    detail: null,
  },
  {
    market: "jd_zheshang_gold",
    quote: quote(937.61, null, "京东金融", false),
    status: "有效",
    detail: null,
  },
  {
    market: "ccb_gold_accumulation",
    quote: quote(939.3, 933.8, "建设银行官网"),
    status: "有效",
    detail: null,
  },
  {
    market: "uob_sgd_gold_savings",
    quote: { ...quote(171.85, 168.2, "大华银行官网"), published: now() - 12 * 60 },
    status: "报价过期",
    detail: "报价已超过时效",
  },
  {
    market: "sge_au9999",
    quote: {
      ...quote(935.6, null, "上海黄金交易所", false),
      day: new Date((now() + 8 * 3600) * 1000).toISOString().slice(0, 10),
    },
    status: "延时参考",
    detail: null,
  },
  {
    market: "xauusd_live_proxy",
    quote: quote(4085.3, null, "国际现货"),
    status: "有效",
    detail: null,
  },
  { market: "usd_cny", quote: quote(7.1235, null, "汇率"), status: "有效", detail: null },
];
const limits: Record<string, number> = { icbc_acc_gold_buy: 936 };
let pinned = "icbc_acc_gold_buy";
let chart: Snapshot["chart"] = ["original", 60];

function walk(count: number, step: number, base: number, end: number): Candle[] {
  let price = base;
  return Array.from({ length: count }, (_, i) => {
    const open = price;
    const close = open + (Math.sin(i * 1.3) + Math.random() - 0.5) * base * 0.0008;
    price = close;
    return {
      time: end - (count - 1 - i) * step,
      open,
      close,
      high: Math.max(open, close) + Math.random() * base * 0.0004,
      low: Math.min(open, close) - Math.random() * base * 0.0004,
      count: 3,
    };
  });
}

type Args = Record<string, unknown>;
export async function invoke<T>(command: string, args: Args = {}): Promise<T> {
  const price = readings.find((r) => r.market === args.market)?.quote?.price ?? 900;
  const result = (() => {
    switch (command) {
      case "check_update":
      case "open_update_page":
        return null;
      case "snapshot":
        return {
          chart,
          legacy_alert: null,
          readings,
          pinned,
          limits,
          storage_error: null,
          last_alert: null,
        };
      case "history": {
        const s = args.seconds as number;
        return walk(1800 / s, s, price, Math.floor(now() / s) * s);
      }
      case "calendar": {
        const step = { day: 86400, week: 604800, month: 2592000 }[args.period as string]!;
        return walk(40, step, price, now() - (now() % 86400));
      }
      case "pin":
        pinned = args.market as string;
        return null;
      case "set_limit":
        if (args.target == null) delete limits[args.market as string];
        else limits[args.market as string] = args.target as number;
        return null;
      case "set_chart":
        chart = [args.mode as Snapshot["chart"][0], args.seconds as number];
        return null;
      default:
        throw new Error(`mock: unknown command ${command}`);
    }
  })();
  if (["pin", "set_limit", "set_chart"].includes(command)) setTimeout(notify);
  return result as T;
}
