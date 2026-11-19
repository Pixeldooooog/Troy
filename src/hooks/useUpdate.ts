import { useCallback, useEffect, useRef, useState } from "react";
import type { Update } from "@/lib/types";
import { api } from "@/lib/api";

const KEY = "troy.release-check.v1";
const HOUR = 3600000;
type Result = { installed: string; checkedAt: number; available: Update | null };

function cached(): Result | null {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (
      r?.installed === __APP_VERSION__ &&
      Number.isFinite(r.checkedAt) &&
      r.checkedAt > 0 &&
      r.checkedAt <= Date.now() &&
      (r.available === null ||
        (typeof r.available?.version === "string" &&
          typeof r.available.installable === "boolean" &&
          (r.available.notes === null || typeof r.available.notes === "string")))
    )
      return r;
  } catch {
    /* An empty cache is safe to recreate. */
  }
  return null;
}

export function useUpdate(automatic: boolean) {
  const [result, setResult] = useState(cached);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const nextAutomatic = useRef((result?.checkedAt ?? 0) + 24 * HOUR);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setError("");
    try {
      const available = await api.checkUpdate();
      const checkedAt = Date.now();
      const next = { installed: __APP_VERSION__, checkedAt, available };
      nextAutomatic.current = checkedAt + 24 * HOUR;
      setResult(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* Keep the session result. */
      }
    } catch (e) {
      nextAutomatic.current = Date.now() + HOUR;
      setError(String(e));
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!automatic) return;
    const poll = () => {
      if (Date.now() >= nextAutomatic.current) void check();
    };
    poll();
    const timer = window.setInterval(poll, HOUR);
    const onShow = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [automatic, check]);

  const download = async () => {
    if (!result?.available) return;
    try {
      setError("");
      await api.openUpdatePage(result.available.version);
    } catch (e) {
      setError(String(e));
    }
  };
  const install = async () => {
    if (!result?.available?.installable || busy.current) return;
    busy.current = true;
    setInstalling(true);
    setError("");
    try {
      await api.installUpdate(result.available.version);
    } catch (e) {
      setError(String(e));
    } finally {
      busy.current = false;
      setInstalling(false);
    }
  };
  return { result, checking, installing, error, check, download, install };
}
export type UpdateCheck = ReturnType<typeof useUpdate>;
