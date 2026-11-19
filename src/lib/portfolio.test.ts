import { describe, expect, it } from "vitest";
import { dayChange, markPrice, positionPnl, premiumOverSge, summarize } from "./portfolio";
import type { Quote, Trend } from "./types";

const quote = (price: number, redemption: number | null = null): Quote => ({
  price,
  redemption,
  source: "",
  observed: 0,
  published: null,
  daily: false,
});
const trend = (prev_close: number | null, basis: Trend["basis"] = "local"): Trend => ({
  market: "x",
  intraday: [],
  prev_close,
  basis,
});

describe("dayChange", () => {
  it("compares against the previous close and keeps its basis", () => {
    const d = dayChange(quote(101), trend(100, "official"))!;
    expect(d.abs).toBeCloseTo(1);
    expect(d.pct).toBeCloseTo(1);
    expect(d.basis).toBe("official");
  });
  it("is null without a quote or baseline", () => {
    expect(dayChange(null, trend(100))).toBeNull();
    expect(dayChange(quote(1), trend(null, null))).toBeNull();
    expect(dayChange(quote(1), undefined)).toBeNull();
  });
});

describe("positions", () => {
  it("values at redemption price, falling back to purchase price", () => {
    expect(markPrice(quote(938, 934))).toBe(934);
    expect(markPrice(quote(937))).toBe(937);
    expect(positionPnl({ grams: 10, cost: 900 }, quote(938, 934))).toBeCloseTo(340);
    expect(positionPnl({ grams: 10 }, quote(938, 934))).toBeNull();
  });

  it("sums held CNY positions with grams", () => {
    const quotes: Record<string, Quote> = {
      a: quote(938, 934),
      b: quote(939, 933),
      uob_sgd_gold_savings: quote(170, 168),
    };
    const s = summarize(
      ["a", "b", "uob_sgd_gold_savings", "c"],
      {
        a: { grams: 50, cost: 880 },
        b: { grams: 20.5, cost: 912.3 },
        uob_sgd_gold_savings: { grams: 5, cost: 160 }, // SGD, excluded
        d: { grams: 99, cost: 1 }, // not held, excluded
      },
      (id) => quotes[id],
      (id) => (id in quotes ? { abs: 1, pct: 0.1, basis: "local" } : null),
    );
    expect(s.count).toBe(2);
    expect(s.grams).toBeCloseTo(70.5);
    expect(s.value).toBeCloseTo(50 * 934 + 20.5 * 933);
    expect(s.pnl).toBeCloseTo(50 * (934 - 880) + 20.5 * (933 - 912.3));
    expect(s.today).toBeCloseTo(70.5);
  });

  it("reports totals as unknown rather than partial", () => {
    const s = summarize(
      ["a", "b"],
      { a: { grams: 1, cost: 900 }, b: { grams: 1 } },
      () => quote(950),
      () => null,
    );
    expect(s.value).toBeCloseTo(1900);
    expect(s.cost).toBeNull();
    expect(s.pnl).toBeNull();
    expect(s.pnlPct).toBeNull();
    expect(s.today).toBeNull();
  });
});

describe("premiumOverSge", () => {
  it("only applies to CNY accounts", () => {
    expect(premiumOverSge("icbc_acc_gold_buy", quote(938), quote(935.6))).toBeCloseTo(2.4);
    expect(premiumOverSge("uob_sgd_gold_savings", quote(170), quote(935))).toBeNull();
    expect(premiumOverSge("icbc_acc_gold_buy", quote(938), null)).toBeNull();
  });
});
