type Num = number | null | undefined;
const bad = (n: Num): n is null | undefined => n == null || !Number.isFinite(n);
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");

/** HH:mm[:ss] in Beijing time. */
export const clock = (epoch: number, seconds = true) =>
  new Date(epoch * 1000).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" as const } : {}),
  });

/** YYYY-MM-DD in Beijing time, sortable as a string. */
export const beijingDay = (epoch: number) =>
  new Date(epoch * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });

export const fmt = (n: Num, digits = 2) => (bad(n) ? "—" : n.toFixed(digits));

export const signed = (n: Num, digits = 2) =>
  bad(n) ? "—" : sign(n) + Math.abs(n).toFixed(digits);

/** Grouped thousands with two decimals, optionally with an explicit sign. */
export const money = (n: Num, withSign = false) =>
  bad(n)
    ? "—"
    : (withSign ? sign(n) : n < 0 ? "−" : "") +
      Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type Trend = "up" | "down" | "flat";
export const trendClass = (n: Num): Trend => (bad(n) || n === 0 ? "flat" : n > 0 ? "up" : "down");
