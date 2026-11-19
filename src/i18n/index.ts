import { useSettings, type Lang } from "@/store/settings";
import { en } from "./en";
import { zh, type Dict } from "./zh";

export type { Dict };
const dicts: Record<Lang, Dict> = { zh, en };

/** Strings for the current UI language. */
export const useT = () => dicts[useSettings()[0].lang];
