import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Settings } from "@/lib/types";

export type { Holding, Lang, Settings, Theme, UpDown } from "@/lib/types";

export type UpdateSettings = (patch: Partial<Settings>) => void;

/**
 * Settings live in the core's SQLite database so the tray can read them and they
 * survive reinstalls. Changes apply immediately and save in order in the background.
 */
export function useSettingsState(onError: (message: string) => void) {
  const [settings, setSettings] = useState<Settings>();
  // Latest value for building the next save without an impure state updater.
  const latest = useRef<Settings | undefined>(undefined);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    api
      .settings()
      .then((loaded) => {
        latest.current = loaded;
        setSettings(loaded);
      })
      .catch((e: unknown) => onError(String(e)));
  }, [onError]);

  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.updown = settings.upDown;
    root.lang = settings.lang === "zh" ? "zh-CN" : "en";
  }, [settings]);

  const update = useCallback<UpdateSettings>(
    (patch) => {
      if (!latest.current) return;
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setSettings(next);
      queue.current = queue.current
        .then(() => api.saveSettings(next))
        .catch((e: unknown) => onError(String(e)));
    },
    [onError],
  );

  return [settings, update] as const;
}

export const SettingsContext = createContext<readonly [Settings, UpdateSettings] | null>(null);

export function useSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings outside SettingsContext");
  return value;
}
