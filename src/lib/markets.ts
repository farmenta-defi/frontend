/**
 * Market and pool domain model with mock data. The market UI reads only from
 * these exports, so swapping to the backend later is a data-layer change
 * (FAR-71); the components stay untouched.
 *
 * Risk parameters come from ./risk-params (single source, spec §6.2);
 * only the market activity numbers (APY, utilization, TVL) are mock here.
 * Nothing about a wallet is: balances, positions and loans are read from the
 * chain (./onchain).
 */

import { RISK_PARAMS, type MarketTier } from "./risk-params";

export type Market = {
  id: MarketTier;
  name: string;
  collateral: string;
  /** One line on who the market is for, shown under the market name. */
  description: string;
  supplyApy: number; // % (mock until contracts are live)
  borrowApr: number; // % (mock)
  utilization: number; // % (mock)
  tvlUsd: number; // mock
  maxLtv: number; // 0..1, from RISK_PARAMS
  liqThreshold: number; // 0..1, from RISK_PARAMS
  liquidatorBonus: number; // 0..1, from RISK_PARAMS
  reserveFactor: number; // %, from RISK_PARAMS
  oracle: "CHAINLINK" | "TWAP"; // from RISK_PARAMS
};

const bc = RISK_PARAMS["blue-chip"];
const meme = RISK_PARAMS.meme;

export const MARKETS: Market[] = [
  {
    id: "blue-chip",
    name: "Blue chip",
    collateral: "ETH · WETH · cbBTC · NVDA, against USDG",
    description: "Chainlink-priced majors and tokenised equity, with conservative parameters.",
    supplyApy: 4.2,
    borrowApr: 6.1,
    utilization: 62,
    tvlUsd: 1_240_000,
    maxLtv: bc.maxLtv,
    liqThreshold: bc.liqThreshold,
    liquidatorBonus: bc.liquidatorBonus,
    reserveFactor: bc.reserveFactorPct,
    oracle: bc.oracle,
  },
  {
    id: "meme",
    name: "Meme",
    collateral: "PONS · PENGU · AI · MEME, against USDG (allowlisted)",
    description: "TWAP-priced allowlisted meme collateral with tighter limits.",
    supplyApy: 9.8,
    borrowApr: 14.3,
    utilization: 71,
    tvlUsd: 342_000,
    maxLtv: meme.maxLtv,
    liqThreshold: meme.liqThreshold,
    liquidatorBonus: meme.liquidatorBonus,
    reserveFactor: meme.reserveFactorPct,
    oracle: meme.oracle,
  },
];

export type NetworkId = "robinhood";

export const NETWORKS: Record<NetworkId, { name: string; chainId: number }> = {
  robinhood: { name: "Robinhood Chain", chainId: 4663 },
};

/**
 * One listed collateral pool: the unit the market table lists and the detail
 * route addresses. A pool belongs to exactly one tier, which is the market its
 * lenders share (spec §1 no. 8 — two isolated markets, many pools inside each).
 */
export type CollateralPool = {
  /**
   * Uniswap v4 poolId, keccak256 of the PoolKey. ETH/USDG and WETH/USDG carry
   * the ids of real pools (docs ARCHITECTURE.md §18: no hook, fee 460 and fee
   * 200), the two `pnpm fork` lists, so their pages act on real positions. The
   * rest are placeholders. Which pools are listed comes from the backend (FAR-71).
   */
  poolId: `0x${string}`;
  /** Lowercased pair, the last URL segment. Readable half of the address. */
  slug: string;
  network: NetworkId;
  tier: MarketTier;
  /** "BASE/QUOTE", the form AssetPair reads. */
  pair: string;
  /** What prices the risky side. */
  trustedBy: string;
  borrowAprPct: number;
  rate6hPct: number;
  totalBorrowUsd: number;
  liquidityUsd: number;
  marketSizeUsd: number;
};

export const COLLATERAL_POOLS: CollateralPool[] = [
  {
    poolId: "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32",
    slug: "eth-usdg",
    network: "robinhood",
    tier: "blue-chip",
    pair: "ETH/USDG",
    trustedBy: "Chainlink",
    borrowAprPct: 6.1,
    rate6hPct: 4.2,
    totalBorrowUsd: 312_400,
    liquidityUsd: 1_240_000,
    marketSizeUsd: 1_240_000,
  },
  {
    poolId: "0x84bd4e2d8be11aeb0afc1195b38f587b61e90068548f1063fdbe448fb8cad0b6",
    slug: "weth-usdg",
    network: "robinhood",
    tier: "blue-chip",
    pair: "WETH/USDG",
    trustedBy: "Chainlink",
    borrowAprPct: 6.1,
    rate6hPct: 4.2,
    totalBorrowUsd: 198_200,
    liquidityUsd: 820_000,
    marketSizeUsd: 820_000,
  },
  {
    poolId: "0x2ad6f81c05b3e7490fa61d84c93b072e5f8ac41d60e93b27a4c8150fd3e6b719",
    slug: "cbbtc-usdg",
    network: "robinhood",
    tier: "blue-chip",
    pair: "cbBTC/USDG",
    trustedBy: "Chainlink",
    borrowAprPct: 5.9,
    rate6hPct: 4.0,
    totalBorrowUsd: 78_400,
    liquidityUsd: 910_000,
    marketSizeUsd: 910_000,
  },
  {
    poolId: "0x8e40b7d29fa1c6350b82e5947dc016af3b95206ec7418d3fa0629bd5417ce082",
    slug: "nvda-usdg",
    network: "robinhood",
    tier: "blue-chip",
    pair: "NVDA/USDG",
    trustedBy: "Chainlink",
    borrowAprPct: 6.8,
    rate6hPct: 4.6,
    totalBorrowUsd: 48_600,
    liquidityUsd: 640_000,
    marketSizeUsd: 640_000,
  },
  {
    poolId: "0xc7e1a4938b025f6d3ca9017e4b82df5610a3c94e7f2b8d05619ae37c2d840bf1",
    slug: "pons-usdg",
    network: "robinhood",
    tier: "meme",
    pair: "PONS/USDG",
    trustedBy: "30m TWAP",
    borrowAprPct: 14.3,
    rate6hPct: 9.8,
    totalBorrowUsd: 24_300,
    liquidityUsd: 342_000,
    marketSizeUsd: 342_000,
  },
  {
    poolId: "0x5b31e7a04c986d2fb8570ae3149cd026f7b8a41e93052dc6187fa3b40c9e2751",
    slug: "pengu-usdg",
    network: "robinhood",
    tier: "meme",
    pair: "PENGU/USDG",
    trustedBy: "30m TWAP",
    borrowAprPct: 15.6,
    rate6hPct: 10.4,
    totalBorrowUsd: 8_400,
    liquidityUsd: 180_000,
    marketSizeUsd: 180_000,
  },
  {
    poolId: "0xa14c930e6bd25f871034ae9c2f60b3d8517e0946cb28d4f7350a1eb63c82d947",
    slug: "ai-usdg",
    network: "robinhood",
    tier: "meme",
    pair: "AI/USDG",
    trustedBy: "30m TWAP",
    borrowAprPct: 17.2,
    rate6hPct: 11.5,
    totalBorrowUsd: 3_100,
    liquidityUsd: 74_000,
    marketSizeUsd: 74_000,
  },
  {
    poolId: "0xd06b2f9143ae785c02b64d1930fa8e57c41b06d2937fe58a10c4b73e6a92d015",
    slug: "meme-usdg",
    network: "robinhood",
    tier: "meme",
    pair: "MEME/USDG",
    trustedBy: "30m TWAP",
    borrowAprPct: 16.4,
    rate6hPct: 10.9,
    totalBorrowUsd: 4_100,
    liquidityUsd: 96_000,
    marketSizeUsd: 96_000,
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

export const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const fmtUsdExact = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compact = (n: number) => {
  const millions = n >= 1_000_000;
  return { figure: (n / (millions ? 1_000_000 : 1_000)).toFixed(2), unit: millions ? "M" : "K" };
};

/** "$312.40K USDG" / "$1.24M USDG", the density the market table reads at. */
export const fmtCompactUsdg = (n: number) => {
  const { figure, unit } = compact(n);
  return `$${figure}${unit} USDG`;
};

/**
 * The same number split at the magnitude, so a headline figure can set its
 * "K"/"M" back a shade instead of shouting it at the same weight as the digits.
 */
export const compactUsdgParts = (n: number) => {
  const { figure, unit } = compact(n);
  return { value: `$${figure}`, unit, inToken: `${figure}${unit} USDG` };
};

export const fmtUsdg = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });
