import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Update } from "@/lib/types";

export type UpdateState =
  | { kind: "idle" | "checking" | "current" | "installing" }
  | { kind: "available"; update: Update }
  | { kind: "error"; message: string };

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Checks for a signed update on launch and every six hours. */
export function useUpdate() {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });

  const check = useCallback(async () => {
    setState({ kind: "checking" });
    try {
      const update = await api.checkUpdate();
      setState(update ? { kind: "available", update } : { kind: "current" });
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }, []);

  const install = useCallback(async () => {
    setState({ kind: "installing" });
    try {
      await api.installUpdate();
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }, []);

  useEffect(() => {
    // Quietly ignore failures here; offline launches are normal.
    const quiet = () =>
      api
        .checkUpdate()
        .then((update) => update && setState({ kind: "available", update }))
        .catch(() => {});
    void quiet();
    const id = setInterval(quiet, SIX_HOURS);
    return () => clearInterval(id);
  }, []);

  return { state, check, install };
}
