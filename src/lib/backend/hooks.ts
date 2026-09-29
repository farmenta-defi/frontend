"use client";

import { keepPreviousData, queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";

import { backendKeys } from "@/lib/query-keys";
import type { MarketTier } from "@/lib/risk-params";

import { BackendError, fetchListedPools, fetchMarkets, fetchPool } from "./client";
import type { HistoryRange, ListedPool, MarketFigures, PoolFigures } from "./figures";

/**
 * The React side of the data layer: the backend's figures as queries, under
 * the keys a confirmed transaction invalidates (`@/lib/query-keys`).
 */

/** The backend reads the chain every 30 seconds (spec §13); asking more often returns the same figures. */
const REFRESH_MS = 30_000;

/** Asking again does not help when the backend is not configured, does not list the pool, or answers in another shape. */
const retry = (failures: number, error: unknown) =>
  failures < 1 && (!(error instanceof BackendError) || error.kind === "unreachable" || error.kind === "unavailable");

const shared = { refetchInterval: REFRESH_MS, retry, retryDelay: 1_000 } as const;

/**
 * What a page shows for a set of figures.
 *
 * `failed` is for figures that never came. When a later reading fails, the
 * figures on screen stay and `error` says they may be behind: a page that
 * blanks every 30 seconds while the backend restarts is worse than one that
 * says so.
 */
export type Figures<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "failed"; data: null; error: unknown }
  | { status: "ready"; data: T; error: unknown | null };

export function figuresOf<T>(query: { data: T | undefined; error: unknown; isError: boolean }): Figures<T> {
  if (query.data !== undefined) return { status: "ready", data: query.data, error: query.isError ? query.error : null };
  if (query.isError) return { status: "failed", data: null, error: query.error };
  return { status: "loading", data: null, error: null };
}

const marketsQuery = (range: HistoryRange) =>
  queryOptions({
    queryKey: backendKeys.markets(range),
    queryFn: ({ signal }) => fetchMarkets(range, { signal }),
    ...shared,
  });

/** Both markets. */
export function useMarkets(range: HistoryRange = "1w"): Figures<MarketFigures[]> {
  return figuresOf(useQuery({ ...marketsQuery(range), placeholderData: keepPreviousData }));
}

/** One market. `ready` with `null` when the backend answered and does not have it. */
export function useMarket(tier: MarketTier, range: HistoryRange = "1w"): Figures<MarketFigures | null> {
  return figuresOf(
    useQuery({
      ...marketsQuery(range),
      placeholderData: keepPreviousData,
      select: (markets: MarketFigures[]): MarketFigures | null => markets.find((market) => market.tier === tier) ?? null,
    }),
  );
}

/** The pools the backend lists in one market, with the terms each lends on. */
export function useListedPools(tier: MarketTier): Figures<ListedPool[]> {
  return figuresOf(
    useQuery(
      queryOptions({
        queryKey: backendKeys.pools(tier),
        queryFn: ({ signal }) => fetchListedPools(tier, { signal }),
        ...shared,
      }),
    ),
  );
}

const poolQuery = (poolId: Hex, range: HistoryRange) =>
  queryOptions({
    queryKey: backendKeys.pool(poolId, range),
    queryFn: ({ signal }) => fetchPool(poolId, range, { signal }),
    ...shared,
  });

/** One pool: its terms, its figures, and its market's history over `range`. */
export function usePoolFigures(poolId: Hex, range: HistoryRange = "1w"): Figures<PoolFigures> {
  return figuresOf(useQuery({ ...poolQuery(poolId, range), placeholderData: keepPreviousData }));
}

/** Several pools at once, in the order asked, for a table of them. */
export function usePoolsFigures(poolIds: readonly Hex[], range: HistoryRange = "1w"): Figures<PoolFigures>[] {
  return useQueries({ queries: poolIds.map((poolId) => poolQuery(poolId, range)) }).map((query) =>
    figuresOf<PoolFigures>(query),
  );
}
