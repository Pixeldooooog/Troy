import { useT } from "@/i18n";
import { fmt, signed, trendClass } from "@/lib/format";
import { BANKS, BENCHMARKS, FX } from "@/lib/markets";
import type { Snapshot, Trend } from "@/lib/types";

/** Scrolling quote strip; pauses on hover and stays still with reduced motion. */
export function Ticker({
  data,
  series,
  open,
}: {
  data?: Snapshot;
  series: Record<string, Trend>;
  open: (id: string) => void;
}) {
  const t = useT();
  const items = [...BANKS, ...BENCHMARKS, FX].map((id) => {
    const q = data?.readings.find((r) => r.market === id)?.quote;
    const prev = series[id]?.prev_close;
    return { id, price: q?.price, pct: q && prev ? (q.price / prev - 1) * 100 : null };
  });
  const row = (copy: number) =>
    items.map((it) => (
      <button
        key={copy + it.id}
        tabIndex={copy ? -1 : 0}
        aria-hidden={copy ? true : undefined}
        disabled={it.id === FX}
        onClick={() => open(it.id)}
      >
        <span>{t.markets[it.id]}</span>
        <b>{fmt(it.price, it.id === FX ? 4 : 2)}</b>
        <em className={trendClass(it.pct)}>
          {it.pct == null
            ? "—"
            : (it.pct > 0 ? "▲ " : it.pct < 0 ? "▼ " : "") +
              signed(it.pct).replace(/^[+−]/, "") +
              "%"}
        </em>
      </button>
    ));
  return (
    <div className="ticker" role="marquee" aria-label="quotes">
      <div className="ticker-track">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}
