"use client";

import { ChartNoAxesColumn, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { Unavailable } from "@/components/app/pool-market-chart";
import { TimeSeriesChart } from "@/components/app/time-series-chart";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";
import { HISTORY_RANGES, type HistoryRange } from "@/lib/backend/figures";
import { useMarket, usePoolFigures } from "@/lib/backend/hooks";
import { rateSeries, rateSummary, type RateSide } from "@/lib/backend/series";
import { fmtPct, NO_FIGURE, orDash } from "@/lib/format";
import type { CollateralPool } from "@/lib/markets";
import { cn } from "@/lib/utils";

const SIDES = [
  { id: "borrow", label: "Borrow" },
  { id: "supply", label: "Supply" },
] as const satisfies readonly { id: RateSide; label: string }[];

const COPY: Record<RateSide, { title: string; hint: string }> = {
  borrow: {
    title: "Borrow rate (6h)",
    hint: "Annualised cost of borrowing from this pool's market, averaged over the last six hours. Every pool in the market shares it.",
  },
  supply: {
    title: "Supply rate (6h)",
    hint: "Annualised yield for USDG lenders in this market, averaged over the last six hours. Every pool in the market shares it.",
  },
};

function BreakdownRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-[13px] text-steel-400">{label}</dt>
      <dd className="tnum text-[13px] font-medium text-foreground">{orDash(value, fmtPct)}</dd>
    </div>
  );
}

/** What borrowing costs and what supplying pays, now and over time, read from the backend. */
export function PoolRates({ pool }: { pool: CollateralPool }) {
  const [side, setSide] = useState<RateSide>("borrow");
  const [range, setRange] = useState<HistoryRange>("1w");
  const figures = usePoolFigures(pool.poolId, range);
  const lending = useMarket(pool.tier);

  const points = useMemo(() => rateSeries(figures.data?.history ?? [], side), [figures.data, side]);
  const summary = useMemo(() => rateSummary(points), [points]);
  const { title, hint } = COPY[side];

  // The backend averages the borrow rate over six hours itself; the supply rate's is taken from the history.
  const sixHours = side === "borrow" ? (figures.data?.rate6hPct ?? null) : summary.average6hPct;
  const instant =
    side === "borrow" ? (figures.data?.borrowAprPct ?? null) : (lending.data?.latest?.supplyApyPct ?? null);

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
            <p
              className={cn(
                "font-display tnum mt-2 text-[30px] font-semibold leading-none sm:text-[34px]",
                sixHours === null ? "text-steel-500" : "text-foreground",
                figures.status === "loading" && "animate-pulse",
              )}
            >
              {sixHours === null ? NO_FIGURE : sixHours.toFixed(2)}
              {sixHours !== null && <span className="text-steel-500">%</span>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Rate" value={side} options={SIDES} onChange={setSide} />
            <SelectMenu label="Period" value={range} options={HISTORY_RANGES} onChange={setRange} />
          </div>
        </div>

        <div className="mt-6">
          {figures.status === "failed" ? (
            <Unavailable />
          ) : (
            <TimeSeriesChart
              points={points}
              label={title}
              formatValue={fmtPct}
              formatTick={(value) => `${value}%`}
              average={
                summary.averagePct === null
                  ? undefined
                  : { value: summary.averagePct, label: `Avg ${fmtPct(summary.averagePct)}` }
              }
            />
          )}
        </div>
      </div>

      {/* A column of the same card, not a card inside it: a rule is all that parts it from the chart. */}
      <div className="border-t border-border/70 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
        <h3 className="text-[15px] font-semibold text-foreground">Rate breakdown</h3>
        <dl className="mt-3">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 pt-1">
            <dt className="flex items-center gap-2 text-[13px] text-steel-300">
              <ChartNoAxesColumn className="size-4 text-steel-400" aria-hidden />
              Native rate
            </dt>
            <dd className="tnum text-[13px] font-medium text-foreground">{orDash(sixHours, fmtPct)}</dd>
          </div>
          <div className="pt-1.5">
            <BreakdownRow label="Instant" value={instant} />
            <BreakdownRow label="24h average" value={summary.average24hPct} />
            <BreakdownRow label="7D average" value={summary.average7dPct} />
          </div>
        </dl>
      </div>
    </div>
  );
}
