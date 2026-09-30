"use client";

import { keepPreviousData, queryOptions, useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";

import { backendKeys } from "@/lib/query-keys";
import type { MarketTier } from "@/lib/risk-params";

import { historyRows, type ActivityPage, type ActivityRow } from "./activity";
import { BackendError, fetchActivity, fetchListedPools, fetchMarkets, fetchPool } from "./client";
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

/**
 * A wallet's history, as far as it has been read.
 *
 * `failed` is for a history that never came. Once rows are on screen they
 * stay: `error` then says that the last read failed, whether it was the
 * refresh or the next page, and the rows may be behind or stop short.
 */
export type WalletHistory =
  | { status: "loading"; rows: []; error: null; hasMore: false }
  | { status: "failed"; rows: []; error: unknown; hasMore: false }
  | { status: "ready"; rows: ActivityRow[]; error: unknown | null; hasMore: boolean };

export function historyOf(query: {
  data: { pages: readonly ActivityPage[] } | undefined;
  error: unknown;
  isError: boolean;
  hasNextPage: boolean;
}): WalletHistory {
  if (query.data !== undefined) {
    return {
      status: "ready",
      rows: historyRows(query.data.pages),
      error: query.isError ? query.error : null,
      hasMore: query.hasNextPage,
    };
  }
  if (query.isError) return { status: "failed", rows: [], error: query.error, hasMore: false };
  return { status: "loading", rows: [], error: null, hasMore: false };
}

/**
 * The connected wallet's transactions in Farmenta, newest first, a page at a
 * time. A refresh reads every page on screen again from the first, each with
 * the cursor of the one just read, so a new transaction pushes the rows down
 * without losing one between two pages.
 */
export function useWalletActivity(account: Address) {
  const query = useInfiniteQuery({
    queryKey: backendKeys.activity(account),
    queryFn: ({ pageParam, signal }) => fetchActivity(account, pageParam, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next ?? undefined,
    ...shared,
  });

  return {
    ...historyOf(query),
    /** The next page is on its way. */
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    /** Asks again for a history that never came. */
    retry: () => void query.refetch(),
  };
}
