import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import type { T } from "./i18n";

export type Quote = {
  price: number;
  redemption: number | null;
  source: string;
  observed: number;
  published: number | null;
  daily: boolean;
};
export type Reading = {
  market: string;
  quote: Quote | null;
  status: string;
  detail: string | null;
};
export type Mode = "original" | "yuan_per_gram" | "relative";
export type Snapshot = {
  chart: [Mode, number];
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
export const viewKeys = ["line", "candles", "day", "week", "month"] as const;
export type View = (typeof viewKeys)[number];

export const BANKS = [
  "icbc_acc_gold_buy",
  "cmb_gold_account_buy",
  "jd_minsheng_gold",
  "jd_zheshang_gold",
  "ccb_gold_accumulation",
  "uob_sgd_gold_savings",
];
export const BENCHMARKS = ["sge_au9999", "xauusd_live_proxy"];
export const SGE = "sge_au9999";
export const SPOT = "xauusd_live_proxy";
export const FX = "usd_cny";
export const OUNCE = 31.1034768;

export const unitOf = (id: string, t: T) =>
  id === "uob_sgd_gold_savings"
    ? t.units.sgd
    : id === SPOT
      ? t.units.usd
      : t.units.cny;
export const isCny = (id: string) =>
  id !== "uob_sgd_gold_savings" && id !== SPOT && id !== FX;

export const clock = (epoch: number, seconds = true) =>
  new Date(epoch * 1000).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" as const } : {}),
  });
const day = (epoch: number) =>
  new Date(epoch * 1000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Shanghai",
  });

export const fmt = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
export const money = (n: number | null | undefined, sign = false) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : (sign ? (n > 0 ? "+" : n < 0 ? "−" : "") : n < 0 ? "−" : "") +
      Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(digits);
export const trendClass = (n: number | null | undefined): "up" | "down" | "flat" =>
  n == null || !Number.isFinite(n) || n === 0 ? "flat" : n > 0 ? "up" : "down";

export const tone = (status?: string) =>
  status === "有效"
    ? "ok"
    : status === "延时参考"
      ? "info"
      : status === "上次报价" || status === "报价过期"
        ? "warn"
        : "off";

/** Snapshot of all markets, refreshed whenever the core reports new quotes. */
export function useSnapshot() {
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    let generation = 0;
    async function refresh() {
      const request = ++generation;
      try {
        const next = await invoke<Snapshot>("snapshot");
        if (active && request === generation) {
          setData(next);
          setError("");
          setTick((n) => n + 1);
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
  const command = async (name: string, args: Record<string, unknown>) => {
    try {
      await invoke(name, args);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };
  return { data, error, tick, command };
}

export type Series = {
  /** 1-minute bars for the last 30 minutes in the market's own unit. */
  intraday: Candle[];
  /** Previous day's last recorded close, for day-over-day change. */
  prevClose: number | null;
};

/**
 * Per-market intraday and daily reference data for the overview. Refetches at
 * most every 10 seconds so a burst of quote events stays cheap.
 */
export function useSeriesMap(markets: string[], tick: number) {
  const [map, setMap] = useState<Record<string, Series>>({});
  const last = useRef({ at: 0, key: "" });
  const key = markets.join(",");
  useEffect(() => {
    const now = Date.now();
    if (last.current.key === key && now - last.current.at < 10_000) return;
    last.current = { at: now, key };
    let active = true;
    const yesterday = day(now / 1000 - 86400);
    void Promise.all(
      markets.map(async (market) => {
        try {
          const [intraday, daily] = await Promise.all([
            invoke<Candle[]>("history", {
              market,
              seconds: 60,
              mode: "original",
            }),
            invoke<Candle[]>("calendar", { market, period: "day" }),
          ]);
          const previousDay = daily.find((b) => day(b.time) === yesterday);
          return [
            market,
            { intraday, prevClose: previousDay?.close ?? null },
          ] as const;
        } catch {
          return [market, { intraday: [], prevClose: null }] as const;
        }
      }),
    ).then((entries) => active && setMap(Object.fromEntries(entries)));
    return () => {
      active = false;
    };
  }, [key, tick]);
  return map;
}

/** Comparable bank quotes in CNY/g, cheapest first, at most 2 minutes apart. */
export function comparableBanks(readings: Reading[]) {
  const banks = readings.filter(
    (r) => BANKS.includes(r.market) && isCny(r.market) && r.status === "有效" && r.quote,
  );
  const stamp = (r: Reading) => r.quote!.published ?? r.quote!.observed;
  const newest = Math.max(...banks.map(stamp));
  return banks
    .filter((r) => newest - stamp(r) <= 120)
    .sort((a, b) => a.quote!.price - b.quote!.price);
}
export const stampOf = (r: Reading) => r.quote!.published ?? r.quote!.observed;
