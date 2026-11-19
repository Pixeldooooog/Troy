import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { beijingDay } from "@/lib/format";
import type { Candle } from "@/lib/types";

export type Series = {
  /** 1-minute bars for the last 30 minutes in the market's own unit. */
  intraday: Candle[];
  /** Last recorded close on the previous Beijing calendar day. */
  prevClose: number | null;
};

const empty: Series = { intraday: [], prevClose: null };

/**
 * Per-market intraday and daily reference data for the overview and ticker.
 * Refetches at most every 10 seconds so a burst of quote events stays cheap.
 */
export function useSeriesMap(markets: string[], tick: number) {
  const [map, setMap] = useState<Record<string, Series>>({});
  const last = useRef({ at: 0, key: "" });
  const key = markets.join(",");

  useEffect(() => {
    const now = Date.now();
    if (last.current.key === key && now - last.current.at < 10_000) return;
    last.current = { at: now, key };
    let active = true;
    let done = false;
    const yesterday = beijingDay(now / 1000 - 86400);
    void Promise.all(
      key.split(",").map(async (market) => {
        try {
          const [intraday, daily] = await Promise.all([
            api.history(market, 60, "original"),
            api.calendar(market, "day"),
          ]);
          const previousDay = daily.find((b) => beijingDay(b.time) === yesterday);
          return [market, { intraday, prevClose: previousDay?.close ?? null }] as const;
        } catch {
          return [market, empty] as const;
        }
      }),
    ).then((entries) => {
      done = true;
      if (active) setMap(Object.fromEntries(entries));
    });
    return () => {
      active = false;
      // Let the next run refetch if this one was cancelled mid-flight.
      if (!done) last.current.at = 0;
    };
  }, [key, tick]);

  return map;
}
