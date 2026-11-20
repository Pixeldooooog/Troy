/** Shapes returned by the Rust core over Tauri IPC (see src-tauri/src/main.rs). */

export type Quote = {
  price: number;
  redemption: number | null;
  source: string;
  observed: number;
  published: number | null;
  daily: boolean;
  day?: string | null;
};

/** Stable quote state codes from the core (monitor::Status). */
export type Status = "live" | "delayed" | "last_known" | "stale" | "waiting" | "unavailable";

export type Reading = {
  market: string;
  quote: Quote | null;
  status: Status;
  detail: string | null;
};

export type Mode = "original" | "yuan_per_gram" | "relative";
export type Period = "day" | "week" | "month";

export type Snapshot = {
  chart: [Mode, number];
  legacy_alert: string | null;
  readings: Reading[];
  pinned: string;
  limits: Record<string, number>;
  storage_error: string | null;
  last_alert: { market: string; price: number; target: number; time: number } | null;
  lang: Lang;
};

/** Where a day-change baseline came from (monitor::Basis). */
export type Basis = "official" | "local";

/** Overview data for one market (monitor::Trend). */
export type Trend = {
  market: string;
  /** 1-minute bars over the last 30 minutes in the market's own unit. */
  intraday: Candle[];
  prev_close: number | null;
  basis: Basis | null;
};

export type Lang = "zh" | "en";
export type Theme = "system" | "light" | "dark";
export type UpDown = "red" | "green";
export type Holding = { grams?: number | null; cost?: number | null };

export type CompareAxis = "percent" | "index" | "cny" | "usd" | "sgd";

/** Window preferences and holdings, stored in SQLite (storage::Settings). */
export type Settings = {
  lang: Lang;
  theme: Theme;
  upDown: UpDown;
  collapsed: boolean;
  ticker: boolean;
  compareAxis: CompareAxis;
  autoUpdates: boolean;
  tracking: { bank: string; seconds: 3 | 5 | 10 } | null;
  /** Accounts the user holds, in display order. */
  held: string[];
  /** Optional position per account, kept when an account is unticked. */
  holdings: Record<string, Holding>;
};

export type Update = { version: string; notes: string | null; installable: boolean };

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  count: number;
};

export const viewKeys = ["line", "candles", "day", "week", "month"] as const;
export type View = (typeof viewKeys)[number];
