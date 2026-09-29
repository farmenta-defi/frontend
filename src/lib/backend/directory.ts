import type { Hex } from "viem";

import type { ListedPool, PoolFigures } from "./figures";

/**
 * The rows of the market table: the pools the app has a page for, each with
 * the figures the backend has for it.
 *
 * Which pools there are is the app's list, until the backend can name a
 * pool's tokens (FAR-82). So a row is there whatever the backend answers, and
 * a figure the backend did not give is absent from it, not zero.
 */
export type DirectoryRow<Pool> = {
  pool: Pool;
  /** The pool's own max LTV at borrow, which the table's LLTV column shows. */
  maxLtvPct: number | null;
  debtUsdg: number | null;
  availableToBorrowUsdg: number | null;
  borrowAprPct: number | null;
  rate6hPct: number | null;
  /** `null` while the backend has not said. */
  frozen: boolean | null;
};

const same = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();

export function directoryRows<Pool extends { poolId: Hex }>(
  pools: readonly Pool[],
  /** What `GET /markets/:tier/pools` lists, both markets together. */
  listed: readonly ListedPool[],
  /** What `GET /pools/:poolId` answered, for the pools it answered for. */
  figures: readonly PoolFigures[],
): DirectoryRow<Pool>[] {
  return pools.map((pool) => {
    const own = figures.find((item) => same(item.poolId, pool.poolId)) ?? null;
    // The pool's own answer is the fresher of the two; the list has its terms when it did not come.
    const terms = own?.terms ?? listed.find((item) => same(item.poolId, pool.poolId))?.terms ?? null;
    return {
      pool,
      maxLtvPct: terms?.maxLtvPct ?? null,
      debtUsdg: own?.debtUsdg ?? null,
      availableToBorrowUsdg: own?.availableToBorrowUsdg ?? null,
      borrowAprPct: own?.borrowAprPct ?? null,
      rate6hPct: own?.rate6hPct ?? null,
      frozen: terms?.frozen ?? null,
    };
  });
}

/** The bounds of the table's advanced filter, as typed: empty is no bound. */
export type DirectoryRanges = {
  borrowMin: string;
  borrowMax: string;
  availableMin: string;
  availableMax: string;
  rateMin: string;
  rateMax: string;
  lltvMin: number;
  lltvMax: number;
};

export const NO_RANGES: DirectoryRanges = {
  borrowMin: "",
  borrowMax: "",
  availableMin: "",
  availableMax: "",
  rateMin: "",
  rateMax: "",
  lltvMin: 0,
  lltvMax: 100,
};

/** A bound that is set is not met by a figure that is absent: the table cannot say the pool is inside it. */
function within(value: number | null, min: string | number, max: string | number) {
  const low = typeof min === "number" ? min : min.trim() === "" ? null : Number(min);
  const high = typeof max === "number" ? max : max.trim() === "" ? null : Number(max);
  if (low === null && high === null) return true;
  if (value === null) return false;
  return (low === null || Number.isNaN(low) || value >= low) && (high === null || Number.isNaN(high) || value <= high);
}

export function inRanges(row: DirectoryRow<unknown>, ranges: DirectoryRanges): boolean {
  const lltvOpen = ranges.lltvMin <= NO_RANGES.lltvMin && ranges.lltvMax >= NO_RANGES.lltvMax;
  return (
    within(row.debtUsdg, ranges.borrowMin, ranges.borrowMax) &&
    within(row.availableToBorrowUsdg, ranges.availableMin, ranges.availableMax) &&
    within(row.rate6hPct, ranges.rateMin, ranges.rateMax) &&
    (lltvOpen || within(row.maxLtvPct, ranges.lltvMin, ranges.lltvMax))
  );
}
