import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Trend } from "@/lib/types";

/**
 * Intraday bars and day-change baselines for every market, in one IPC call.
 * Refetches at most every 10 seconds so a burst of quote events stays cheap.
 */
export function useOverview(tick: number) {
  const [map, setMap] = useState<Record<string, Trend>>({});
  const last = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - last.current < 10_000) return;
    last.current = now;
    let active = true;
    let done = false;
    api
      .overview()
      .then((trends) => {
        done = true;
        if (active) setMap(Object.fromEntries(trends.map((t) => [t.market, t])));
      })
      .catch(() => {
        done = true;
      });
    return () => {
      active = false;
      // Let the next run refetch if this one was cancelled mid-flight.
      if (!done) last.current = 0;
    };
  }, [tick]);

  return map;
}
