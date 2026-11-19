import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Candle, Mode, Period, Snapshot } from "./types";

/** Typed wrappers around the Tauri commands registered in src-tauri. */
export const api = {
  checkUpdate: () => invoke<string | null>("check_update"),
  openUpdatePage: (version: string) => invoke<void>("open_update_page", { version }),
  snapshot: () => invoke<Snapshot>("snapshot"),
  history: (market: string, seconds: number, mode: Mode) =>
    invoke<Candle[]>("history", { market, seconds, mode }),
  calendar: (market: string, period: Period) => invoke<Candle[]>("calendar", { market, period }),
  pin: (market: string) => invoke<void>("pin", { market }),
  setLimit: (market: string, target: number | null) =>
    invoke<void>("set_limit", { market, target }),
  setChart: (mode: Mode, seconds: number) => invoke<void>("set_chart", { mode, seconds }),
  /** Fires whenever the core records new quotes or settings. */
  onMarketChanged: (handler: () => void) => listen("market-changed", handler),
};
