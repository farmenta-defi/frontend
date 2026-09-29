/**
 * Simulated history for a pool page: balances, rates, and transactions.
 *
 * Nothing here is read from a chain. The FarmentaMarket contracts are not
 * deployed, so every series is generated, and every surface that renders one
 * has to say so. When the indexer is live these three functions are the only
 * things that change; the components read their return types and nothing else.
 *
 * Generation is seeded from the pool and anchored to a fixed instant rather
 * than the clock, so the server and the browser draw the same chart and a
 * reload never reshuffles the numbers.
 */

import type { CollateralPool } from "./markets";
import type { MarketTier } from "./risk-params";

/** The instant the simulated history ends at. */
export const MOCK_AS_OF = Date.UTC(2026, 8, 27, 15, 34, 25);

/**
 * Dollars per USDG. Held at exactly one because the rest of the page already
 * reads USDG as dollars; a chart quoting $95.98K under a headline that says
 * $96.00K would look like a bug, not a price. Replace with the oracle's USDG
 * price when there is one to read.
 */
export const MOCK_USDG_PRICE = 1;

const HOUR_MS = 3_600_000;
/** Rates are reported as six-hour averages, so everything is sampled at that step. */
const STEP_MS = 6 * HOUR_MS;
const STEPS_PER_DAY = 4;
const STEPS = STEPS_PER_DAY * 365;
const LAST_STEP_AT = Math.floor(MOCK_AS_OF / STEP_MS) * STEP_MS;

import type { SeriesPoint } from "./chart-axis";

export type HistoryRange = "1w" | "1m" | "3m" | "1y";

export const HISTORY_RANGES: readonly { id: HistoryRange; label: string; steps: number }[] = [
  { id: "1w", label: "1 week", steps: STEPS_PER_DAY * 7 },
  { id: "1m", label: "1 month", steps: STEPS_PER_DAY * 30 },
  { id: "3m", label: "3 months", steps: STEPS_PER_DAY * 90 },
  { id: "1y", label: "1 year", steps: STEPS },
];

export type BalanceMetric = "borrow" | "supply" | "liquidity";
export type RateSide = "borrow" | "supply";

/* ------------------------------------------------------------------ */
/* Seeded randomness                                                   */
/* ------------------------------------------------------------------ */

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** mulberry32: small, fast, and identical in every JavaScript engine. */
const seeded = (seed: string) => {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Roughly bell-shaped in [-1, 1]. */
const noise = (random: () => number) => (random() + random() + random() - 1.5) / 1.5;

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

const toPoints = (values: number[], range: HistoryRange): SeriesPoint[] => {
  const steps = HISTORY_RANGES.find((item) => item.id === range)!.steps;
  const start = values.length - steps;
  return values.slice(start).map((v, i) => ({
    t: LAST_STEP_AT - (steps - 1 - i) * STEP_MS,
    v,
  }));
};

/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

/** Walks backwards from today's figure, so the chart always ends on it. */
const walkBack = (seed: string, end: number, drift: number, volatility: number) => {
  const random = seeded(seed);
  const values = new Array<number>(STEPS);
  values[STEPS - 1] = end;
  for (let i = STEPS - 1; i > 0; i--) {
    // An occasional larger move: a big deposit, or a loan repaid in one go.
    const jump = random() < 0.008 ? noise(random) * 0.05 : 0;
    values[i - 1] = values[i] / (1 + drift + volatility * noise(random) + jump);
  }
  return values;
};

const balanceCache = new Map<string, Record<BalanceMetric, number[]>>();

const balancesOf = (pool: CollateralPool) => {
  const cached = balanceCache.get(pool.poolId);
  if (cached) return cached;

  const supply = walkBack(`${pool.poolId}:supply`, pool.liquidityUsd, 0.0004, 0.003);
  const borrow = walkBack(`${pool.poolId}:borrow`, pool.totalBorrowUsd, 0.0006, 0.006).map(
    // Loans can never exceed what was supplied.
    (value, i) => Math.min(value, supply[i] * 0.9),
  );
  const liquidity = supply.map((value, i) => value - borrow[i]);

  const balances = { borrow, supply, liquidity };
  balanceCache.set(pool.poolId, balances);
  return balances;
};

/** USDG amounts. Multiply by `MOCK_USDG_PRICE` for dollars. */
export const poolBalanceHistory = (
  pool: CollateralPool,
  metric: BalanceMetric,
  range: HistoryRange,
) => toPoints(balancesOf(pool)[metric], range);

/* ------------------------------------------------------------------ */
/* Rates                                                               */
/* ------------------------------------------------------------------ */

/** Hovers around today's rate: utilisation moves, the rate follows, then settles. */
const hoverAround = (seed: string, centre: number) => {
  const random = seeded(seed);
  const values = new Array<number>(STEPS);
  values[STEPS - 1] = centre * (1 + 0.004 * noise(random));
  for (let i = STEPS - 1; i > 0; i--) {
    values[i - 1] = values[i] + 0.08 * (centre - values[i]) + centre * 0.006 * noise(random);
  }
  return values;
};

const rateCache = new Map<string, number[]>();

const ratesOf = (seed: string, instantPct: number) => {
  const cached = rateCache.get(seed);
  if (cached) return cached;
  const values = hoverAround(seed, instantPct);
  rateCache.set(seed, values);
  return values;
};

export type RateHistory = {
  points: SeriesPoint[];
  /** Mean over the range on screen. */
  averagePct: number;
  /** The latest six-hour average. */
  latestPct: number;
  instantPct: number;
  average24hPct: number;
  average7dPct: number;
};

/**
 * Borrowing is priced per pool. Supplying is priced per market, because USDG
 * funds every pool in the tier, so every pool in a tier shares one supply curve.
 */
export const poolRateHistory = (
  pool: CollateralPool,
  side: RateSide,
  instantPct: number,
  range: HistoryRange,
): RateHistory => {
  const owner: string | MarketTier = side === "borrow" ? pool.poolId : pool.tier;
  const values = ratesOf(`${owner}:rate:${side}`, instantPct);
  const points = toPoints(values, range);
  return {
    points,
    averagePct: mean(points.map((point) => point.v)),
    latestPct: values[values.length - 1],
    instantPct,
    average24hPct: mean(values.slice(-STEPS_PER_DAY)),
    average7dPct: mean(values.slice(-STEPS_PER_DAY * 7)),
  };
};
