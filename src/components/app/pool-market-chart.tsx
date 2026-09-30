"use client";

import { useMemo, useState } from "react";

import { TimeSeriesChart } from "@/components/app/time-series-chart";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";
import { HISTORY_RANGES, type HistoryRange } from "@/lib/backend/figures";
import { usePoolFigures } from "@/lib/backend/hooks";
import { balanceSeries, type BalanceMetric } from "@/lib/backend/series";
import { compactParts, compactTick, NO_FIGURE } from "@/lib/format";
import { MARKETS, type CollateralPool } from "@/lib/markets";
import { cn } from "@/lib/utils";

const METRICS = [
  { id: "borrow", label: "Borrow", title: "Outstanding loans" },
  { id: "supply", label: "Supply", title: "Total supplied" },
  { id: "liquidity", label: "Liquidity", title: "Available liquidity" },
] as const satisfies readonly { id: BalanceMetric; label: string; title: string }[];

const formatValue = (value: number) => {
  const { figure, unit } = compactParts(value);
  return `${figure}${unit} USDG`;
};

/**
 * How much has been lent, supplied, and left to borrow, over time, read from
 * the backend. The amounts are the market's: lenders supply to the market,
 * and every pool in it draws on the same USDG.
 */
export function PoolMarketChart({ pool }: { pool: CollateralPool }) {
  const [metric, setMetric] = useState<BalanceMetric>("borrow");
  const [range, setRange] = useState<HistoryRange>("1w");
  const figures = usePoolFigures(pool.poolId, range);

  const points = useMemo(() => balanceSeries(figures.data?.history ?? [], metric), [figures.data, metric]);

  const market = MARKETS.find((item) => item.id === pool.tier)!;
  const title = METRICS.find((item) => item.id === metric)!.title;
  const latest = points[points.length - 1];
  const headline = latest ? compactParts(latest.v) : null;

  return (
    <div className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="text-[13px] text-steel-400">
            {title}, {market.name} market (USDG)
          </p>
          <p
            className={cn(
              "font-display tnum mt-2 text-[30px] font-semibold leading-none sm:text-[34px]",
              headline ? "text-foreground" : "text-steel-500",
              figures.status === "loading" && "animate-pulse",
            )}
          >
            {headline ? headline.figure : NO_FIGURE}
            {headline && <span className="text-steel-500">{headline.unit}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Balance" value={metric} options={METRICS} onChange={setMetric} />
          <SelectMenu label="Period" value={range} options={HISTORY_RANGES} onChange={setRange} />
        </div>
      </div>

      <div className="mt-6">
        {figures.status === "failed" ? (
          <Unavailable />
        ) : (
          <TimeSeriesChart
            points={points}
            label={`${title} in USDG`}
            formatValue={formatValue}
            formatTick={compactTick}
          />
        )}
      </div>
    </div>
  );
}

/** Where a chart would be, when its history could not be read. The reason is given once, at the top of the page. */
export function Unavailable() {
  return (
    <div className="flex h-[218px] items-center justify-center text-[13px] text-steel-500">
      History unavailable
    </div>
  );
}
