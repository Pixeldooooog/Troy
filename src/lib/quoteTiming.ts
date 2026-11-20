import type { Dict } from "@/i18n";
import { beijingDay, clock } from "./format";
import { SGE } from "./markets";
import type { Reading } from "./types";

/** Show the calendar date when an old quote crosses midnight in Beijing. */
export function quoteClock(time: number, now = Date.now() / 1000) {
  return beijingDay(time) === beijingDay(now) ? clock(time) : beijingDay(time) + " " + clock(time);
}

export function sourceTiming(reading: Reading, t: Dict) {
  const q = reading.quote;
  if (!q) return "";
  const collected = t.observed + " " + quoteClock(q.observed);
  if (q.published != null) return t.quoted + " " + quoteClock(q.published) + " · " + collected;
  return q.day ? t.tradingDay + " " + q.day + " · " + collected : collected;
}

export function statusLabel(reading: Reading, t: Dict) {
  if (reading.market === SGE && reading.status === "delayed") return t.exchangeDelay;
  return t.status[reading.status] ?? reading.status;
}
