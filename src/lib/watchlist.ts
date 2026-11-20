import { en } from "@/i18n/en";
import { BANKS, BENCHMARKS } from "./markets";

const sidebarBanks = [...BANKS].sort((a, b) => en.short[a].localeCompare(en.short[b], "en"));

export function watchlistMarkets(list: string, held: string[]) {
  if (list === "bench") return BENCHMARKS;
  if (list === "held") return sidebarBanks.filter((id) => held.includes(id));
  if (list === "other") return sidebarBanks.filter((id) => !held.includes(id));
  return [...sidebarBanks, ...BENCHMARKS];
}
