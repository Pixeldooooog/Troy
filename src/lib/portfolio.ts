import { isCny } from "./markets";
import type { Basis, Holding, Quote, Trend } from "./types";

export type Change = { abs: number; pct: number; basis: Basis };

/** Change from the previous close; null when either side is missing. */
export function dayChange(quote: Quote | null | undefined, trend?: Trend): Change | null {
  const prev = trend?.prev_close;
  if (!quote || !prev || !trend.basis) return null;
  return { abs: quote.price - prev, pct: (quote.price / prev - 1) * 100, basis: trend.basis };
}

/** What a position could be sold for now: redemption price, else purchase price. */
export const markPrice = (q: Quote | null | undefined) => (q ? (q.redemption ?? q.price) : null);

/** Unrealized P&L of one position, or null without grams, cost or a quote. */
export function positionPnl(h: Holding | undefined, q: Quote | null | undefined) {
  const mark = markPrice(q);
  return h?.grams && h.cost && mark != null ? (mark - h.cost) * h.grams : null;
}

export type Summary = {
  grams: number;
  /** Null when any position lacks a quote. */
  value: number | null;
  /** Null when any position lacks a cost. */
  cost: number | null;
  pnl: number | null;
  pnlPct: number | null;
  /** Null when any position lacks a day-change baseline. */
  today: number | null;
  count: number;
};

/**
 * Totals over CNY accounts that are held and have grams entered. A total is null
 * rather than partial when an input is missing, so the UI never under-reports.
 */
export function summarize(
  held: string[],
  holdings: Record<string, Holding>,
  quote: (id: string) => Quote | null | undefined,
  change: (id: string) => Change | null,
): Summary {
  const rows = held
    .filter((id) => isCny(id) && holdings[id]?.grams)
    .map((id) => {
      const grams = holdings[id].grams!;
      const mark = markPrice(quote(id));
      const cost = holdings[id].cost;
      const d = change(id);
      return {
        grams,
        value: mark != null ? mark * grams : null,
        cost: cost ? cost * grams : null,
        today: d ? d.abs * grams : null,
      };
    });
  const total = (key: "value" | "cost" | "today") =>
    rows.some((r) => r[key] == null) ? null : rows.reduce((sum, r) => sum + r[key]!, 0);
  const value = total("value");
  const cost = total("cost");
  const pnl = value != null && cost != null ? value - cost : null;
  return {
    grams: rows.reduce((sum, r) => sum + r.grams, 0),
    value,
    cost,
    pnl,
    pnlPct: pnl != null && cost ? (pnl / cost) * 100 : null,
    today: total("today"),
    count: rows.length,
  };
}

/** Bank purchase price over SGE Au99.99, for CNY accounts only. */
export const premiumOverSge = (
  id: string,
  q: Quote | null | undefined,
  sge: Quote | null | undefined,
) => (q && sge && isCny(id) ? q.price - sge.price : null);
