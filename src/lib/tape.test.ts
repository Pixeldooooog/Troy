import { expect, it } from "vitest";
import { inWindow, minuteAt, quotePoints, segments } from "./tape";
import type { Candle, CompareAxis } from "./types";

const bar = (time: number, open: number, close: number): Candle => ({
  time,
  open,
  close,
  high: Math.max(open, close),
  low: Math.min(open, close),
  count: 2,
});
const end = 3600;
const visible = inWindow(
  [bar(1740, 10, 10), bar(1800, 100, 101), bar(1860, 101, 99), bar(1980, 102, 103)],
  end,
);

it("keeps missing minutes empty and clips to the current time window", () => {
  const points = quotePoints(visible, "usd", 1);
  expect(minuteAt(2 / 30, end - 1800)).toBe(1920);
  expect(points.find((p) => p.time === 1920)).toBeUndefined();
  expect(segments(points).map((run) => run.length)).toEqual([2, 1]);
});

it("bases the axis on the first visible open and preserves the native quote", () => {
  const last = (axis: CompareAxis) => quotePoints(visible, axis, 0.22).at(-1)!;
  expect(last("percent").value).toBeCloseTo(3);
  expect(last("index").value).toBe(103);
  expect(last("cny")).toMatchObject({ value: 103 * 0.22, raw: 103 });
});
