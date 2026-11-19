import type { Dict } from "@/i18n";
import type { Reading } from "./types";

export const BANKS = [
  "icbc_acc_gold_buy",
  "cmb_gold_account_buy",
  "jd_minsheng_gold",
  "jd_zheshang_gold",
  "ccb_gold_accumulation",
  "uob_sgd_gold_savings",
];
export const SGE = "sge_au9999";
export const SPOT = "xauusd_live_proxy";
export const FX = "usd_cny";
export const BENCHMARKS = [SGE, SPOT];
export const ALL_MARKETS = [...BANKS, ...BENCHMARKS, FX];
/** Grams per troy ounce. */
export const OUNCE = 31.1034768;

export const unitOf = (id: string, t: Dict) =>
  id === "uob_sgd_gold_savings" ? t.units.sgd : id === SPOT ? t.units.usd : t.units.cny;

export const isCny = (id: string) => id !== "uob_sgd_gold_savings" && id !== SPOT && id !== FX;

/** Maps the core's status text to a colour tone. */
export const tone = (status?: string) =>
  status === "有效"
    ? "ok"
    : status === "延时参考"
      ? "info"
      : status === "上次报价" || status === "报价过期"
        ? "warn"
        : "off";

export const stampOf = (r: Reading) => r.quote!.published ?? r.quote!.observed;

/** Comparable bank quotes in CNY/g, cheapest first, at most 2 minutes apart. */
export function comparableBanks(readings: Reading[]) {
  const banks = readings.filter(
    (r) => BANKS.includes(r.market) && isCny(r.market) && r.status === "有效" && r.quote,
  );
  const newest = Math.max(...banks.map(stampOf));
  return banks
    .filter((r) => newest - stampOf(r) <= 120)
    .sort((a, b) => a.quote!.price - b.quote!.price);
}
