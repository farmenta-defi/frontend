import type { Hex } from "viem";

import type { MarketTier } from "@/lib/risk-params";
import { bpsFieldToPct, parseBaseUnits, pctFieldToNumber, usdFieldToNumber, usdgFieldToNumber, usdgToNumber } from "@/lib/units";

import type { WireListedPool, WireMarket, WirePool, WireSnapshot } from "./wire";

/**
 * The backend's answers as figures to show. Every unit is converted here and
 * nowhere else (spec §13): a component receives USDG and percentages as
 * numbers, and `null` where the backend has no figure.
 *
 * `null` is never a zero. A market nobody has supplied to reports zero, and
 * that is shown as zero; a figure the backend does not have is shown as absent.
 */

/** The backend keeps a history at four resolutions, and these are their names on the wire. */
export type HistoryRange = "1w" | "1m" | "3m" | "1y";

export const HISTORY_RANGES: readonly { id: HistoryRange; label: string }[] = [
  { id: "1w", label: "1 week" },
  { id: "1m", label: "1 month" },
  { id: "3m", label: "3 months" },
  { id: "1y", label: "1 year" },
];

/** One reading of a market. */
export type MarketReading = {
  /** When it was taken, as milliseconds since the epoch. */
  at: number;
  /** USDG the lenders own: cash plus loans, less the reserves. The market's TVL. */
  suppliedUsdg: number | null;
  /** USDG lent out. */
  borrowedUsdg: number | null;
  /** USDG sitting idle in the market: what can be borrowed or withdrawn. */
  liquidityUsdg: number | null;
  utilizationPct: number | null;
  borrowAprPct: number | null;
  supplyApyPct: number | null;
};

export type MarketFigures = {
  tier: MarketTier;
  /** `null` while the backend has taken no reading of the market. */
  latest: MarketReading | null;
  /** Oldest first. */
  history: MarketReading[];
};

/** What a pool lends on, as the chain has it for that pool, not the market's preset. */
export type PoolTerms = {
  maxLtvPct: number | null;
  /** The threshold in force: lower than the listed one while a delisting ramp runs. */
  liquidationThresholdPct: number | null;
  liquidatorBonusPct: number | null;
  /** A tenth of the bonus, paid by the liquidator into the reserves. Derived, not stored (spec §6.2). */
  protocolLiquidationFeePct: number | null;
  debtCapUsdg: number | null;
  minPositionUsd: number | null;
  /** Frozen pools take no new collateral and give no new loans. */
  frozen: boolean;
};

export type ListedPool = {
  poolId: Hex;
  tier: MarketTier;
  terms: PoolTerms;
};

export type PoolFigures = ListedPool & {
  /** USDG borrowed against this pool's positions. */
  debtUsdg: number | null;
  /** The least of the market's idle cash, the room under the pool's cap, and the room under the market's. */
  availableToBorrowUsdg: number | null;
  /** The borrow rate of the pool's market, at its latest reading. */
  borrowAprPct: number | null;
  /** The same rate, averaged over the last six hours. */
  rate6hPct: number | null;
  /** The history of the pool's market, oldest first: lenders supply to the market, not to a pool. */
  history: MarketReading[];
};

/** The backend writes the tier as "blueChip" in a market and as 1 or 2 in a pool. */
export function tierOf(wire: unknown): MarketTier | null {
  if (wire === "blueChip" || wire === "blue-chip" || wire === 1) return "blue-chip";
  if (wire === "meme" || wire === 2) return "meme";
  return null;
}

export function readingOf(snapshot: WireSnapshot): MarketReading | null {
  const at = Date.parse(snapshot.observedAt);
  if (Number.isNaN(at)) return null;

  const supplied = parseBaseUnits(snapshot.totalAssets);
  const borrowed = parseBaseUnits(snapshot.totalBorrows);
  const reserves = parseBaseUnits(snapshot.reserves);
  // `totalAssets` leaves the reserves out, and they are cash in the market all the same.
  const cash = supplied === null || borrowed === null || reserves === null ? null : supplied + reserves - borrowed;

  return {
    at,
    suppliedUsdg: supplied === null ? null : usdgToNumber(supplied),
    borrowedUsdg: borrowed === null ? null : usdgToNumber(borrowed),
    liquidityUsdg: cash === null ? null : usdgToNumber(cash > 0n ? cash : 0n),
    utilizationPct: bpsFieldToPct(snapshot.utilizationBps),
    borrowAprPct: bpsFieldToPct(snapshot.borrowAprBps),
    supplyApyPct: bpsFieldToPct(snapshot.supplyApyBps),
  };
}

const historyOf = (history: readonly WireSnapshot[]) =>
  history
    .map(readingOf)
    .filter((reading): reading is MarketReading => reading !== null)
    .sort((a, b) => a.at - b.at);

/** `null` for a market whose tier the app does not know. */
export function marketOf(market: WireMarket): MarketFigures | null {
  const tier = tierOf(market.tier);
  if (!tier) return null;
  return { tier, latest: market.snapshot ? readingOf(market.snapshot) : null, history: historyOf(market.history) };
}

function termsOf(pool: WireListedPool): PoolTerms {
  const bonus = bpsFieldToPct(pool.liquidatorBonusBps);
  return {
    maxLtvPct: bpsFieldToPct(pool.maxLtvBps),
    liquidationThresholdPct: bpsFieldToPct(pool.effectiveLtBps),
    liquidatorBonusPct: bonus,
    protocolLiquidationFeePct: bonus === null ? null : bonus / 10,
    debtCapUsdg: usdgFieldToNumber(pool.debtCapUsdg),
    minPositionUsd: usdFieldToNumber(pool.minPositionUsd),
    frozen: pool.frozen,
  };
}

/** `null` for a pool whose tier the app does not know. */
export function listedPoolOf(pool: WireListedPool): ListedPool | null {
  const tier = tierOf(pool.tier);
  if (!tier) return null;
  return { poolId: pool.id.toLowerCase() as Hex, tier, terms: termsOf(pool) };
}

export function poolOf(pool: WirePool): PoolFigures | null {
  const listed = listedPoolOf(pool);
  if (!listed) return null;
  return {
    ...listed,
    debtUsdg: usdgFieldToNumber(pool.poolDebtUsdg),
    availableToBorrowUsdg: usdgFieldToNumber(pool.availableToBorrowUsdg),
    borrowAprPct: pctFieldToNumber(pool.borrowAprPct),
    rate6hPct: pctFieldToNumber(pool.rate6hPct),
    history: historyOf(pool.history),
  };
}

/**
 * What a wallet's deposit in a market earns a year, as a percentage: the
 * market's supply APY at its latest reading. A wallet with no deposit there
 * earns nothing, which is a zero and needs no reading. `null` when it has a
 * deposit and the backend has no rate to give.
 */
export function depositApyPct(holding: boolean, market: MarketFigures | null): number | null {
  if (!holding) return 0;
  return market?.latest?.supplyApyPct ?? null;
}

/**
 * The pools of `listed` the app has a page for, in the order of `known`.
 *
 * Until the backend can say which tokens a pool pairs (FAR-82), a pool's name
 * is written in the app. A pool the backend lists and the app does not know
 * would have to be shown under an invented name, so it is left out and
 * reported instead.
 */
export function knownPools<Known extends { poolId: Hex }, Listed extends { poolId: Hex }>(
  listed: readonly Listed[],
  known: readonly Known[],
  report: (message: string) => void = (message) => console.warn(message),
): { pool: Known; listed: Listed }[] {
  const same = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();
  for (const pool of listed) {
    if (!known.some((item) => same(item.poolId, pool.poolId))) {
      report(`backend: pool ${pool.poolId} is listed and this app has no page for it; it is not shown`);
    }
  }
  return known.flatMap((pool) => {
    const match = listed.find((item) => same(item.poolId, pool.poolId));
    return match ? [{ pool, listed: match }] : [];
  });
}
