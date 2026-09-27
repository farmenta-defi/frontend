"use client";

import { useMemo, useState } from "react";

import { TimeSeriesChart } from "@/components/app/time-series-chart";
import { Segmented } from "@/components/ui/segmented";
import { SelectMenu } from "@/components/ui/select-menu";
import type { CollateralPool } from "@/lib/markets";
import {
  compactParts,
  compactTick,
  HISTORY_RANGES,
  MOCK_USDG_PRICE,
  poolBalanceHistory,
  type BalanceMetric,
  type HistoryRange,
} from "@/lib/pool-history";

const METRICS = [
  { id: "borrow", label: "Borrow", title: "Outstanding loans" },
  { id: "supply", label: "Supply", title: "Total supplied" },
  { id: "liquidity", label: "Liquidity", title: "Available liquidity" },
] as const satisfies readonly { id: BalanceMetric; label: string; title: string }[];

const UNITS = [
  { id: "USDG", label: "USDG" },
  { id: "USD", label: "USD" },
] as const;

type Unit = (typeof UNITS)[number]["id"];

/** How much has been lent, supplied, and left to borrow, over time. */
export function PoolMarketChart({ pool }: { pool: CollateralPool }) {
  const [metric, setMetric] = useState<BalanceMetric>("borrow");
  const [unit, setUnit] = useState<Unit>("USD");
  const [range, setRange] = useState<HistoryRange>("3m");

  const points = useMemo(() => {
    const price = unit === "USD" ? MOCK_USDG_PRICE : 1;
    return poolBalanceHistory(pool, metric, range).map((point) => ({
      t: point.t,
      v: point.v * price,
    }));
  }, [pool, metric, unit, range]);

  const title = METRICS.find((item) => item.id === metric)!.title;
  const sign = unit === "USD" ? "$" : "";
  const headline = compactParts(points[points.length - 1].v);
  const formatValue = (value: number) => {
    const { figure, unit: magnitude } = compactParts(value);
    return unit === "USD" ? `$${figure}${magnitude}` : `${figure}${magnitude} USDG`;
  };

  return (
    <div className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="text-[13px] text-steel-400">
            {title} ({unit})
          </p>
          <p className="font-display tnum mt-2 text-[30px] font-semibold leading-none text-foreground sm:text-[34px]">
            {sign}
            {headline.figure}
            <span className="text-steel-500">{headline.unit}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Balance" value={metric} options={METRICS} onChange={setMetric} />
          <Segmented label="Unit" value={unit} options={UNITS} onChange={setUnit} />
          <SelectMenu label="Period" value={range} options={HISTORY_RANGES} onChange={setRange} />
        </div>
      </div>

      <div className="mt-6">
        <TimeSeriesChart
          points={points}
          label={`${title} in ${unit}`}
          formatValue={formatValue}
          formatTick={(value) => `${sign}${compactTick(value)}`}
        />
      </div>
    </div>
  );
}
