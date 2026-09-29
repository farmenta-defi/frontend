import type { SeriesPoint } from "@/lib/chart-axis";

import type { MarketReading } from "./figures";

/**
 * A market's history as the series a chart draws, and the averages beside it.
 *
 * Every series is the market's, also on a pool's page: lenders supply to the
 * market and every pool in it borrows from the same cash at the same rate
 * (spec §1 no. 8).
 */
export type BalanceMetric = "borrow" | "supply" | "liquidity";
export type RateSide = "borrow" | "supply";

const HOUR_MS = 3_600_000;

const BALANCE: Record<BalanceMetric, (reading: MarketReading) => number | null> = {
  borrow: (reading) => reading.borrowedUsdg,
  supply: (reading) => reading.suppliedUsdg,
  liquidity: (reading) => reading.liquidityUsdg,
};

const RATE: Record<RateSide, (reading: MarketReading) => number | null> = {
  borrow: (reading) => reading.borrowAprPct,
  supply: (reading) => reading.supplyApyPct,
};

/** A reading without the figure is left out, not drawn at zero. */
const seriesOf = (history: readonly MarketReading[], pick: (reading: MarketReading) => number | null) =>
  history.flatMap((reading): SeriesPoint[] => {
    const v = pick(reading);
    return v === null ? [] : [{ t: reading.at, v }];
  });

/** USDG over time. */
export const balanceSeries = (history: readonly MarketReading[], metric: BalanceMetric) =>
  seriesOf(history, BALANCE[metric]);

/** A rate over time, in percent. */
export const rateSeries = (history: readonly MarketReading[], side: RateSide) => seriesOf(history, RATE[side]);

const mean = (points: readonly SeriesPoint[]) =>
  points.length === 0 ? null : points.reduce((sum, point) => sum + point.v, 0) / points.length;

/**
 * The mean of the samples in the `hours` up to the latest one, or `null` when
 * the series is empty. Counted back from the latest sample rather than from
 * the clock, so the server and the browser agree, and so a history that ends
 * an hour ago still has its last day.
 */
export function averageOver(points: readonly SeriesPoint[], hours: number): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  return mean(points.filter((point) => point.t > last.t - hours * HOUR_MS));
}

export type RateSummary = {
  /** Mean over the whole series on screen. */
  averagePct: number | null;
  average6hPct: number | null;
  average24hPct: number | null;
  average7dPct: number | null;
};

export const rateSummary = (points: readonly SeriesPoint[]): RateSummary => ({
  averagePct: mean(points),
  average6hPct: averageOver(points, 6),
  average24hPct: averageOver(points, 24),
  average7dPct: averageOver(points, 24 * 7),
});
