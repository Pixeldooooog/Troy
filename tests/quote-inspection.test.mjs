import test from "node:test";
import assert from "node:assert/strict";
import { inWindow, minuteAt, segments, quotePoints } from "../src/lib/tape.ts";

const end = 3600;
const bars = [
  { time: 1740, open: 10, close: 10 },
  { time: 1800, open: 100, close: 101 },
  { time: 1860, open: 101, close: 99 },
  { time: 1980, open: 102, close: 103 },
];
test("the inspector keeps missing minutes empty and clips to the actual time window", () => {
  const points = quotePoints(inWindow(bars, end), "usd", 1);
  assert.equal(minuteAt(2 / 30, end - 1800), 1920);
  assert.equal(
    points.find((p) => p.time === 1920),
    undefined,
  );
  assert.deepEqual(
    segments(points).map((run) => run.length),
    [2, 1],
  );
});
test("the axis uses the first visible open and preserves the reported price", () => {
  const selected = inWindow(bars, end);
  const last = (axis) => quotePoints(selected, axis, 0.22).at(-1);
  assert.ok(Math.abs(last("percent").value - 3) < 1e-8);
  assert.equal(last("index").value, 103);
  assert.equal(last("cny").value, 103 * 0.22);
  assert.equal(last("cny").raw, 103);
});
