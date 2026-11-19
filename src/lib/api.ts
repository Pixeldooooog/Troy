import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Candle, Mode, Period, Settings, Snapshot, Trend, Update } from "./types";

/** Typed wrappers around the commands in src-tauri/src/commands.rs. */
export const api = {
  openUpdatePage: (version: string) => invoke<void>("open_update_page", { version }),
  snapshot: () => invoke<Snapshot>("snapshot"),
  overview: () => invoke<Trend[]>("overview"),
  history: (market: string, seconds: number, mode: Mode) =>
    invoke<Candle[]>("history", { market, seconds, mode }),
  calendar: (market: string, period: Period) => invoke<Candle[]>("calendar", { market, period }),
  pin: (market: string) => invoke<void>("pin", { market }),
  setLimit: (market: string, target: number | null) =>
    invoke<void>("set_limit", { market, target }),
  setChart: (mode: Mode, seconds: number) => invoke<void>("set_chart", { mode, seconds }),
  settings: () => invoke<Settings>("settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  autostart: () => invoke<boolean>("autostart"),
  setAutostart: (enabled: boolean) => invoke<void>("set_autostart", { enabled }),
  checkUpdate: () => invoke<Update | null>("check_update"),
  /** Downloads, verifies and installs the update, then restarts the app. */
  installUpdate: (version: string) => invoke<void>("install_update", { version }),
  /** Fires whenever the core records new quotes or settings. */
  onMarketChanged: (handler: () => void) => listen("market-changed", handler),
};
