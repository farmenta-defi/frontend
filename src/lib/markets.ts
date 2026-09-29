/**
 * The two markets and the pools listed in them: what each one is, not what
 * it holds.
 *
 * Every figure a page shows (APY, utilisation, TVL, a pool's terms, its debt)
 * is read from the backend (`./backend`), and everything about a wallet from
 * the chain (`./onchain`). What is written here is identity: a pool's id, the
 * `PoolKey` it is the hash of, and the name it goes by. The backend cannot
 * name a pool's tokens yet, because all six pools were created before the
 * indexer's first block (FAR-82); when it can, this list moves there.
 */

import type { Address, Hex } from "viem";

import type { PoolKey } from "./onchain/contracts";
import type { MarketTier } from "./risk-params";

export type Market = {
  id: MarketTier;
  name: string;
  /** The tokens whose pools are listed, as a line of text. */
  collateral: string;
  /** One line on who the market is for, shown under the market name. */
  description: string;
};

export const MARKETS: Market[] = [
  {
    id: "blue-chip",
    name: "Blue chip",
    collateral: "ETH · META · NVDA, against USDG",
    description: "Chainlink-priced majors and tokenised equity, with conservative parameters.",
  },
  {
    id: "meme",
    name: "Meme",
    collateral: "CASHCAT · PONS · AI, against USDG (allowlisted)",
    description: "TWAP-priced allowlisted meme collateral with tighter limits.",
  },
];

export type NetworkId = "robinhood";

export const NETWORKS: Record<NetworkId, { name: string; chainId: number }> = {
  robinhood: { name: "Robinhood Chain", chainId: 4663 },
};

/** USDG on Robinhood Chain, 6 decimals (docs ARCHITECTURE.md §18). Every listed pool pairs a token with it. */
export const USDG: Address = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

/** Native ETH, which has no contract: Uniswap v4 writes it as the zero address. */
const NATIVE: Address = "0x0000000000000000000000000000000000000000";
const NO_HOOK: Address = "0x0000000000000000000000000000000000000000";
/** Uniswap v4's mark, in `fee`, for a pool whose hook sets the swap fee. */
const DYNAMIC_FEE = 0x800000;

/**
 * One listed collateral pool: the unit the market table lists and the detail
 * route addresses. A pool belongs to exactly one tier, which is the market its
 * lenders share (spec §1 no. 8 — two isolated markets, many pools inside each).
 */
export type CollateralPool = {
  /** Uniswap v4 poolId: keccak256 of `key`, which a test holds it to. */
  poolId: Hex;
  /** Lowercased pair, the last URL segment. Readable half of the address. */
  slug: string;
  network: NetworkId;
  tier: MarketTier;
  /**
   * "BASE/USDG", the form AssetPair reads. USDG is named second whichever
   * side of the pool it is on: a pool orders its currencies by address, and
   * USDG is currency0 in META/USDG and NVDA/USDG.
   */
  pair: string;
  /** What prices the risky side. */
  trustedBy: string;
  /** The pool as Uniswap v4 identifies it (docs ARCHITECTURE.md §18.1). */
  key: PoolKey;
  /** The token paired with USDG. */
  base: { symbol: string; decimals: number };
  /**
   * When the base token's price feed moves. A stock's feed follows the US
   * stock market, five days a week, and the oracle refuses a price older than
   * 25 hours: over a weekend the pool cannot lend or let indebted collateral go.
   */
  feedHours: "always" | "us-stock-market";
};

export const COLLATERAL_POOLS: CollateralPool[] = [
  {
    poolId: "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551",
    slug: "eth-usdg",
    network: "robinhood",
    tier: "blue-chip",
    pair: "ETH/USDG",
    trustedBy: "Chainlink",
    key: {
      currency0: NATIVE,
      currency1: USDG,
      fee: DYNAMIC_FEE,
      tickSpacing: 10,
      hooks: "0x06a889870C8f83640D6816319f72e2aA579b6080",
    },
    base: { symbol: "ETH", decimals: 18 },
    feedHours: "always",
  },
  {
    poolId: "0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36",
    slug: "meta-usdg",
    network: "robinhood",
    tier: "blue-chip",
    pair: "META/USDG",
    trustedBy: "Chainlink",
    key: {
      currency0: USDG,
      currency1: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
      fee: 3000,
      tickSpacing: 60,
      hooks: NO_HOOK,
    },
    base: { symbol: "META", decimals: 18 },
    feedHours: "us-stock-market",
  },
  {
    poolId: "0x6444a8e0b267406a15db74ca00c4a24bdfa81ed3180f5b6d0851f8ed6f4f29c5",
    slug: "nvda-usdg",
    network: "robinhood",
    tier: "blue-chip",
    pair: "NVDA/USDG",
    trustedBy: "Chainlink",
    key: {
      currency0: USDG,
      currency1: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
      fee: 100,
      tickSpacing: 1,
      hooks: NO_HOOK,
    },
    base: { symbol: "NVDA", decimals: 18 },
    feedHours: "us-stock-market",
  },
  {
    poolId: "0xa92a3df27a00a276183ff7265fd8affa11df1fe8bb23ddfaf13f6c879a3f818b",
    slug: "cashcat-usdg",
    network: "robinhood",
    tier: "meme",
    pair: "CASHCAT/USDG",
    trustedBy: "30m TWAP",
    key: {
      currency0: "0x020bfC650A365f8BB26819deAAbF3E21291018b4",
      currency1: USDG,
      fee: 2690,
      tickSpacing: 54,
      hooks: NO_HOOK,
    },
    base: { symbol: "CASHCAT", decimals: 18 },
    feedHours: "always",
  },
  {
    poolId: "0x486435a1f76cd58193f854c6e6213cd05fd58d637865d02065ff558b387fa6ea",
    slug: "pons-usdg",
    network: "robinhood",
    tier: "meme",
    pair: "PONS/USDG",
    trustedBy: "30m TWAP",
    key: {
      currency0: "0x39dBED3a2bd333467115dE45665cC57F813C4571",
      currency1: USDG,
      fee: DYNAMIC_FEE,
      tickSpacing: 60,
      hooks: "0x08E52564Bad99E05a694b4809F397edcA417A080",
    },
    base: { symbol: "PONS", decimals: 18 },
    feedHours: "always",
  },
  {
    poolId: "0x7aebd80541bfaaf23dbb6e99ce13d4d31c1a84c91414f971eadbff7db5f85995",
    slug: "ai-usdg",
    network: "robinhood",
    tier: "meme",
    pair: "AI/USDG",
    trustedBy: "30m TWAP",
    key: {
      currency0: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18",
      currency1: USDG,
      fee: 2300,
      tickSpacing: 23,
      hooks: NO_HOOK,
    },
    base: { symbol: "AI", decimals: 18 },
    feedHours: "always",
  },
];

/** `/robinhood/blue-chip/0x…/eth-usdg` — network, tier, pool identity, then the readable pair. */
export const poolHref = (pool: CollateralPool) =>
  `/${pool.network}/${pool.tier}/${pool.poolId}/${pool.slug}`;

/**
 * Resolves a detail route back to a pool. Every segment has to agree, so a
 * poolId pasted under the wrong tier or pair is a 404 rather than a page
 * showing one pool's identity beside another's numbers.
 */
export const findPool = (network: string, tier: string, poolId: string, slug: string) =>
  COLLATERAL_POOLS.find(
    (pool) =>
      pool.network === network &&
      pool.tier === tier &&
      pool.slug === slug &&
      pool.poolId.toLowerCase() === poolId.toLowerCase(),
  ) ?? null;

/** The pool with this id, when the app has a page for it. */
export const poolById = (poolId: Hex | null | undefined) =>
  (poolId && COLLATERAL_POOLS.find((pool) => pool.poolId.toLowerCase() === poolId.toLowerCase())) || null;
