import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Snapshot } from "@/lib/types";

/** Snapshot of all markets, refreshed whenever the core reports new quotes. */
export function useSnapshot() {
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    let generation = 0;
    async function refresh() {
      const request = ++generation;
      try {
        const next = await api.snapshot();
        if (active && request === generation) {
          setData(next);
          setError("");
          setTick((n) => n + 1);
        }
      } catch (e) {
        if (active && request === generation) setError(String(e));
      }
    }
    const subscription = api.onMarketChanged(() => {
      if (active && !document.hidden) void refresh();
    });
    subscription
      .then(() => {
        if (active) void refresh();
      })
      .catch((e: unknown) => {
        if (active) setError(String(e));
      });
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", resume);
      subscription.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  /** Runs a command, surfacing failures in the error banner. Resolves to success. */
  const run = useCallback(async (action: Promise<unknown>) => {
    try {
      await action;
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, []);

  return { data, error, tick, run };
}

export type Run = ReturnType<typeof useSnapshot>["run"];
