import type { QueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";

import type { MarketTier } from "./risk-params";

/**
 * Query keys, in one place for the two sources a page reads from.
 *
 * `backend` is the data layer's (FAR-71): what is shown, up to 30 seconds old.
 * `chain` is what a transaction is decided on, read through the browser's RPC
 * (FAR-72). Both are here so that a confirmed transaction can invalidate the
 * backend's queries by the same keys the data layer fetches them under.
 *
 * Identity is the backend's (FAR-39): `tokenId`, `poolId` (the `marketId`
 * segment of a pool's URL) and the tier.
 */
const lower = (value: string) => value.toLowerCase();

export const backendKeys = {
  all: ["backend"] as const,
  markets: () => ["backend", "markets"] as const,
  pools: (tier: MarketTier) => ["backend", "pools", tier] as const,
  pool: (poolId: Hex) => ["backend", "pool", lower(poolId)] as const,
  portfolio: (account: Address) => ["backend", "portfolio", lower(account)] as const,
  activity: (account: Address) => ["backend", "activity", lower(account)] as const,
};

export const chainKeys = {
  all: ["chain"] as const,
  lender: (tier: MarketTier, account: Address) => ["chain", "lender", tier, lower(account)] as const,
  /** Which positions are the account's, from the chain's logs. */
  positions: (account: Address) => ["chain", "positions", lower(account)] as const,
  position: (tier: MarketTier, tokenId: bigint, account: Address) =>
    ["chain", "position", tier, tokenId.toString(), lower(account)] as const,
};

/**
 * After a receipt: everything a transaction can have changed is refetched,
 * without a page reload. The chain's figures are what the panel shows in the
 * meantime; nothing optimistic is written into a list the backend owns.
 *
 * A transaction moves the market's totals (markets, its pools), the account's
 * portfolio and its history. `poolId` narrows nothing away: a borrow in one
 * pool changes the utilisation, and so the rates, of every pool in the tier.
 */
export function invalidateAfterTransaction(
  queryClient: QueryClient,
  { tier, account, poolId }: { tier: MarketTier; account: Address; poolId?: Hex | null },
) {
  const keys: readonly (readonly string[])[] = [
    chainKeys.all,
    backendKeys.markets(),
    backendKeys.pools(tier),
    ...(poolId ? [backendKeys.pool(poolId)] : []),
    backendKeys.portfolio(account),
    backendKeys.activity(account),
  ];
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
