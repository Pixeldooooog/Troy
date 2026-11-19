import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "zh" | "en";
export type Theme = "system" | "light" | "dark";
export type UpDown = "red" | "green";
export type Holding = { grams?: number; cost?: number };

export type Settings = {
  lang: Lang;
  theme: Theme;
  upDown: UpDown;
  collapsed: boolean;
  ticker: boolean;
  /** Banks the user owns, in display order. */
  held: string[];
  holdings: Record<string, Holding>;
};

const KEY = "troy.settings.v1";
const defaults: Settings = {
  lang: "zh",
  theme: "system",
  upDown: "red",
  collapsed: false,
  ticker: true,
  held: ["icbc_acc_gold_buy", "ccb_gold_accumulation"],
  holdings: {},
};

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

export function useSettingsState() {
  const [settings, setSettings] = useState(load);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.updown = settings.upDown;
    root.lang = settings.lang === "zh" ? "zh-CN" : "en";
  }, [settings]);
  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  return [settings, update] as const;
}

export const SettingsContext = createContext<
  readonly [Settings, (patch: Partial<Settings>) => void]
>([defaults, () => {}]);
export const useSettings = () => useContext(SettingsContext);
