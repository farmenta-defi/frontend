"use client";

import { ChartNoAxesColumn, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { TimeSeriesChart } from "@/components/app/time-series-chart";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";
import type { CollateralPool } from "@/lib/markets";
import {
  HISTORY_RANGES,
  poolRateHistory,
  type HistoryRange,
  type RateSide,
} from "@/lib/pool-history";

const SIDES = [
  { id: "borrow", label: "Borrow" },
  { id: "supply", label: "Supply" },
] as const satisfies readonly { id: RateSide; label: string }[];

const COPY: Record<RateSide, { title: string; hint: string }> = {
  borrow: {
    title: "Borrow rate (6h)",
    hint: "Annualised cost of borrowing from this pool, averaged over the last six hours.",
  },
  supply: {
    title: "Supply rate (6h)",
    hint: "Annualised yield for USDG lenders in this market, averaged over the last six hours. Every pool in the market shares it.",
  },
};

const pct = (value: number) => `${value.toFixed(2)}%`;

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-[13px] text-steel-400">{label}</dt>
      <dd className="tnum text-[13px] font-medium text-foreground">{pct(value)}</dd>
    </div>
  );
}

/** What borrowing costs and what supplying pays, now and over time. */
export function PoolRates({
  pool,
  supplyApyPct,
}: {
  pool: CollateralPool;
  /** Supplying is priced per market, so the page passes the market's figure in. */
  supplyApyPct: number;
}) {
  const [side, setSide] = useState<RateSide>("borrow");
  const [range, setRange] = useState<HistoryRange>("1m");

  const history = useMemo(
    () => poolRateHistory(pool, side, side === "borrow" ? pool.borrowAprPct : supplyApyPct, range),
    [pool, side, supplyApyPct, range],
  );
  const { title, hint } = COPY[side];

  return (
    <div className="surface grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_216px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <div className="group/hint relative inline-flex items-center gap-1.5">
              <span className="text-[13px] text-steel-400">{title}</span>
              <button
                type="button"
                aria-label={`About ${title}`}
                className="focus-ring rounded-full text-steel-600 hover:text-steel-400"
              >
                <Info className="size-3.5" aria-hidden />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-60 rounded-lg border border-border bg-popover px-2.5 py-2 text-[11px] leading-[17px] text-steel-300 shadow-xl group-focus-within/hint:block group-hover/hint:block"
              >
                {hint}
              </span>
            </div>
            <p className="font-display tnum mt-2 text-[30px] font-semibold leading-none text-foreground sm:text-[34px]">
              {history.latestPct.toFixed(2)}
              <span className="text-steel-500">%</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Rate" value={side} options={SIDES} onChange={setSide} />
            <SelectMenu label="Period" value={range} options={HISTORY_RANGES} onChange={setRange} />
          </div>
        </div>

        <div className="mt-6">
          <TimeSeriesChart
            points={history.points}
            label={title}
            formatValue={pct}
            formatTick={(value) => `${value}%`}
            average={{ value: history.averagePct, label: `Avg ${pct(history.averagePct)}` }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-white/[0.03] p-5">
        <h3 className="text-[15px] font-semibold text-foreground">Rate breakdown</h3>
        <dl className="mt-3">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 pt-1">
            <dt className="flex items-center gap-2 text-[13px] text-steel-300">
              <ChartNoAxesColumn className="size-4 text-steel-400" aria-hidden />
              Native rate
            </dt>
            <dd className="tnum text-[13px] font-medium text-foreground">{pct(history.latestPct)}</dd>
          </div>
          <div className="pt-1.5">
            <BreakdownRow label="Instant" value={history.instantPct} />
            <BreakdownRow label="24h average" value={history.average24hPct} />
            <BreakdownRow label="7D average" value={history.average7dPct} />
          </div>
        </dl>
      </div>
    </div>
  );
}
