import type { Address, Hex } from "viem";

import type { MarketTier } from "@/lib/risk-params";

import {
  activityPageOf,
  poolActivityPageOf,
  type ActivityPage,
  type PoolActivityFilter,
  type PoolActivityPage,
} from "./activity";
import { listedPoolOf, marketOf, poolOf, type HistoryRange, type ListedPool, type MarketFigures, type PoolFigures } from "./figures";
import { readActivity, readListedPools, readMarkets, readPool, readPoolActivity } from "./wire";

/**
 * The backend, as the app asks it (FAR-80): the markets, the pools of one
 * market, one pool, and the history of a wallet and of a pool (FAR-71). What comes back is
 * already in the units a page shows; a component never converts.
 *
 * These are figures to show. Nothing a transaction is sized from comes from
 * here: that is read from the chain (`@/lib/onchain`), so the actions keep
 * working while the backend is down (spec §13).
 */

/** Why there are no figures. A page says which, and never fills the gap with a number. */
export type BackendFailure =
  /** `NEXT_PUBLIC_API_URL` is empty: this build was not given a backend. */
  | "not-configured"
  /** No answer: the network, the DNS, CORS, or the time ran out. */
  | "unreachable"
  /** 503, or another 5xx: the backend is up and cannot answer, as when the indexer is behind (FAR-83). */
  | "unavailable"
  /** 404: the backend does not list what was asked for. */
  | "not-found"
  /** An answer that is not the shape the backend documents. */
  | "invalid";

export class BackendError extends Error {
  readonly kind: BackendFailure;
  /** The HTTP status, when there was an answer. */
  readonly status: number | null;

  constructor(kind: BackendFailure, message: string, status: number | null = null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BackendError";
    this.kind = kind;
    this.status = status;
  }
}

export type RequestOptions = {
  /** Defaults to `NEXT_PUBLIC_API_URL`. */
  baseUrl?: string | null;
  /** Defaults to the platform's. */
  fetch?: typeof fetch;
  /** Cancels the request, as when the page that asked has gone. */
  signal?: AbortSignal;
};

/** Long enough for a cold cache on the backend, short enough that a page does not look hung. */
const TIMEOUT_MS = 10_000;

/** The backend's address without a trailing slash, or `null` when the build was given none. */
export function apiUrl(): string | null {
  // Written out in full: Next.js replaces this exact expression at build time.
  const url = process.env.NEXT_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

async function get<T>(path: string, read: (body: unknown) => T | null, options: RequestOptions): Promise<T> {
  const base = options.baseUrl === undefined ? apiUrl() : options.baseUrl?.trim().replace(/\/+$/, "") || null;
  if (!base) throw new BackendError("not-configured", "NEXT_PUBLIC_API_URL is not set");

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(`${base}${path}`, { signal, headers: { accept: "application/json" } });
  } catch (error) {
    // The page went away and took its request with it: not a failure of the backend.
    if (options.signal?.aborted) throw error;
    throw new BackendError("unreachable", `no answer from ${path}`, null, { cause: error });
  }

  if (response.status === 404) throw new BackendError("not-found", `${path} is not listed`, 404);
  if (!response.ok) {
    const kind = response.status >= 500 ? "unavailable" : "invalid";
    throw new BackendError(kind, `${path} answered ${response.status}`, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new BackendError("invalid", `${path} did not answer with JSON`, response.status, { cause: error });
  }
  const answer = read(body);
  if (answer === null) throw new BackendError("invalid", `${path} answered in a shape the app does not know`, response.status);
  return answer;
}

/** Both markets, each with its latest reading and its history over `range`. */
export function fetchMarkets(range: HistoryRange = "1w", options: RequestOptions = {}): Promise<MarketFigures[]> {
  return get(
    `/markets?range=${range}`,
    (body) => {
      const markets = readMarkets(body)?.map(marketOf);
      return markets && markets.every((market) => market !== null) ? (markets as MarketFigures[]) : null;
    },
    options,
  );
}

/** The pools listed in one market, with the terms each lends on. */
export function fetchListedPools(tier: MarketTier, options: RequestOptions = {}): Promise<ListedPool[]> {
  return get(
    `/markets/${tier}/pools`,
    (body) => {
      const pools = readListedPools(body)?.map(listedPoolOf);
      return pools && pools.every((pool) => pool !== null) ? (pools as ListedPool[]) : null;
    },
    options,
  );
}

/** One pool: its terms, its figures, and its market's history over `range`. */
export function fetchPool(poolId: Hex, range: HistoryRange = "1w", options: RequestOptions = {}): Promise<PoolFigures> {
  return get(
    `/pools/${poolId}?range=${range}`,
    (body) => {
      const pool = readPool(body);
      return pool ? poolOf(pool) : null;
    },
    options,
  );
}

/** How many rows of a wallet's history are asked for at once. The backend takes 1 to 100. */
export const ACTIVITY_PAGE_SIZE = 25;

/**
 * One page of a wallet's history, newest first: the first page, or the one
 * after `cursor`, which is the `next` of the page before.
 */
export function fetchActivity(
  account: Address,
  cursor: string | null = null,
  options: RequestOptions = {},
): Promise<ActivityPage> {
  const after = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  return get(
    `/activity/${account}?limit=${ACTIVITY_PAGE_SIZE}${after}`,
    (body) => {
      const activity = readActivity(body);
      return activity ? activityPageOf(activity) : null;
    },
    options,
  );
}

/**
 * One page of a pool's history, newest first: the transactions of every
 * wallet on the positions of that pool. `kind` narrows it to one kind, which
 * the backend does; "all" asks for every kind.
 */
export function fetchPoolActivity(
  poolId: Hex,
  kind: PoolActivityFilter = "all",
  cursor: string | null = null,
  options: RequestOptions = {},
): Promise<PoolActivityPage> {
  const only = kind === "all" ? "" : `&kind=${kind}`;
  const after = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  return get(
    `/pools/${poolId}/activity?limit=${ACTIVITY_PAGE_SIZE}${only}${after}`,
    (body) => {
      const activity = readPoolActivity(body);
      return activity ? poolActivityPageOf(activity) : null;
    },
    options,
  );
}

/** What a page says when the figures did not come. One sentence per reason, and what still works. */
export function failureMessage(error: unknown): string {
  const kind = error instanceof BackendError ? error.kind : "unreachable";
  const onchain = "Supplying, borrowing, repaying and withdrawing still work: they go through your wallet.";
  switch (kind) {
    case "not-configured":
      return `This build has no market data service configured, so there are no figures to show. ${onchain}`;
    case "unavailable":
      return `The market data service is catching up with the chain, so the figures are not shown. ${onchain}`;
    case "not-found":
      return `The market data service does not list this pool, so there are no figures to show. ${onchain}`;
    case "invalid":
      return `The market data service answered in a form this app does not read, so the figures are not shown. ${onchain}`;
    case "unreachable":
      return `The market data service did not answer, so the figures are not shown. ${onchain}`;
  }
}

/**
 * What a list of transactions says when it did not come: the Activity tab of
 * a wallet, or the Activity section of a pool. The list is the backend's copy
 * of the chain's logs: the transactions are on the chain whether or not the
 * copy can be read.
 */
export function historyFailureMessage(error: unknown, of: "wallet" | "pool" = "wallet"): string {
  const kind = error instanceof BackendError ? error.kind : "unreachable";
  const [history, onchain] =
    of === "wallet"
      ? ["your history is", "Your transactions are on the chain, and the block explorer lists them."]
      : ["this pool's transactions are", "They are on the chain, and the block explorer lists them."];
  switch (kind) {
    case "not-configured":
      return of === "wallet"
        ? `This build has no market data service configured, so there is no history to show. ${onchain}`
        : `This build has no market data service configured, so ${history} not shown. ${onchain}`;
    case "unavailable":
      return `The market data service is catching up with the chain, so ${history} not shown. ${onchain}`;
    case "not-found":
      return of === "pool"
        ? `The market data service does not list this pool, so ${history} not shown. ${onchain}`
        : `The market data service answered in a form this app does not read, so ${history} not shown. ${onchain}`;
    case "invalid":
      return `The market data service answered in a form this app does not read, so ${history} not shown. ${onchain}`;
    case "unreachable":
      return `The market data service did not answer, so ${history} not shown. ${onchain}`;
  }
}
