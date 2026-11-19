import { describe, expect, it } from "vitest";
import { beijingDay, clock, fmt, money, signed, trendClass } from "./format";

describe("format", () => {
  it("renders missing and non-finite numbers as a dash", () => {
    for (const f of [fmt, signed, money]) {
      expect(f(null)).toBe("—");
      expect(f(undefined)).toBe("—");
      expect(f(NaN)).toBe("—");
      expect(f(Infinity)).toBe("—");
    }
  });

  it("uses a true minus sign and explicit plus", () => {
    expect(signed(1.234)).toBe("+1.23");
    expect(signed(-1.235, 1)).toBe("−1.2");
    expect(signed(0)).toBe("0.00");
  });

  it("groups thousands for money", () => {
    expect(money(65848.9)).toBe("65,848.90");
    expect(money(-1234.5)).toBe("−1,234.50");
    expect(money(3146.75, true)).toBe("+3,146.75");
  });

  it("classifies trends", () => {
    expect(trendClass(0.01)).toBe("up");
    expect(trendClass(-0.01)).toBe("down");
    expect(trendClass(0)).toBe("flat");
    expect(trendClass(null)).toBe("flat");
  });

  it("formats in Beijing time regardless of the host time zone", () => {
    // 2026-11-19 13:50:20 +08:00
    expect(clock(1795067420)).toBe("13:50:20");
    expect(clock(1795067420, false)).toBe("13:50");
    // 2026-11-19 16:00 UTC is already the next day in Beijing.
    expect(beijingDay(1795104000)).toBe("2026-11-20");
  });
});
