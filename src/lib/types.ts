/** Shapes returned by the Rust core over Tauri IPC (see src-tauri/src/main.rs). */

export type Quote = {
  price: number;
  redemption: number | null;
  source: string;
  observed: number;
  published: number | null;
  daily: boolean;
};

export type Reading = {
  market: string;
  quote: Quote | null;
  status: string;
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
  last_alert: { market: string; price: number; time: number } | null;
};

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
