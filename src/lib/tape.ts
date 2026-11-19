// Overview charts use minute closes. Keep holes in the time axis when polling stops.
import type { Candle, CompareAxis } from "@/lib/types";

export type MinutePoint = { time: number; value: number };

export const latestMinute = () => Math.floor(Date.now() / 60000) * 60;
export const minuteAt = (fraction: number, start: number) =>
  start + Math.round(Math.max(0, Math.min(fraction, 1)) * 30) * 60;

export function inWindow(bars: Candle[], end: number) {
  return bars.filter((bar) => bar.time >= end - 1800 && bar.time <= end);
}

export function segments<T extends { time: number }>(points: T[]) {
  const result: T[][] = [];
  let previous: number | undefined;
  for (const p of points) {
    if (previous === undefined || p.time !== previous + 60) result.push([]);
    result[result.length - 1].push(p);
    previous = p.time;
  }
  return result;
}

export function quotePoints(bars: Candle[], axis: CompareAxis, scale: number) {
  const first = bars[0]?.open;
  if (!first || first <= 0) return [];
  return bars.map(({ time, close }) => {
    const ratio = close / first;
    const value =
      axis === "percent" ? (ratio - 1) * 100 : axis === "index" ? ratio * 100 : close * scale;
    return { time, raw: close, value };
  });
}

export function linePath(
  points: MinutePoint[],
  x: (n: number) => number,
  y: (n: number) => number,
) {
  return points.map((p, i) => (i ? "L" : "M") + x(p.time) + " " + y(p.value)).join(" ");
}
