import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/zh";
import { comparableBanks, isCny, tone, unitOf } from "./markets";
import type { Reading } from "./types";

const reading = (
  market: string,
  price: number,
  published: number,
  status: Reading["status"] = "live",
): Reading => ({
  market,
  status,
  detail: null,
  quote: { price, redemption: null, source: "", observed: published, published, daily: false },
});

describe("markets", () => {
  it("knows each market's unit", () => {
    expect(unitOf("icbc_acc_gold_buy", zh)).toBe("元/克");
    expect(unitOf("uob_sgd_gold_savings", zh)).toBe("新元/克");
    expect(unitOf("xauusd_live_proxy", zh)).toBe("美元/盎司");
    expect(isCny("sge_au9999")).toBe(true);
    expect(isCny("uob_sgd_gold_savings")).toBe(false);
  });

  it("maps every status code to a tone", () => {
    expect(tone("live")).toBe("ok");
    expect(tone("delayed")).toBe("info");
    expect(tone("last_known")).toBe("warn");
    expect(tone("stale")).toBe("warn");
    expect(tone("waiting")).toBe("off");
    expect(tone(undefined)).toBe("off");
  });

  it("ranks live CNY bank quotes within two minutes, cheapest first", () => {
    const now = 1_795_067_420;
    const ranked = comparableBanks([
      reading("icbc_acc_gold_buy", 938.4, now),
      reading("ccb_gold_accumulation", 937.1, now - 60),
      reading("cmb_gold_account_buy", 930, now - 121), // too old
      reading("jd_minsheng_gold", 920, now, "stale"), // not live
      reading("uob_sgd_gold_savings", 170, now), // not CNY
      reading("sge_au9999", 900, now), // not a bank
    ]);
    expect(ranked.map((r) => r.market)).toEqual(["ccb_gold_accumulation", "icbc_acc_gold_buy"]);
  });
});
