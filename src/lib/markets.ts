/**
 * Market + LP-position domain model with mock data. The market UI reads only
 * from these exports, so swapping to live wagmi/indexer reads later is a
 * data-layer change; the components stay untouched.
 *
 * Risk parameters come from ./risk-params (single source, spec §6.2);
 * only the market activity numbers (APY, utilization, TVL) are mock here.
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

export type LpPosition = {
  tokenId: number;
  pair: string;
  range: string;
  valueUsd: number;
  marketId: MarketTier;
  inRange: boolean;
  uncollectedFeesUsd: number;
  composition: string; // human-readable token breakdown of the position
  collateralUsd: number;
  borrowedUsd: number;
  healthFactor: number;
  status: "healthy" | "warning" | "critical" | "liquidatable";
};

export type Liquidation = {
  id: string;
  positionId: number;
  borrower: string;
  collateral: string;
  debtUsd: number;
  healthFactor: number;
  threshold: number;
  bonus: number;
  status: "warning" | "at-risk" | "liquidatable";
};

const bc = RISK_PARAMS["blue-chip"];
const meme = RISK_PARAMS.meme;

export const MARKETS: Market[] = [
  {
    id: "blue-chip",
    name: "Blue chip",
    collateral: "ETH/USDG · WETH/USDG",
    description: "Chainlink-priced ETH and WETH collateral with conservative parameters.",
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
    collateral: "PONS/USDG (allowlisted)",
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
  /** Uniswap v4 poolId, keccak256 of the PoolKey. Mock until the pools are listed. */
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
    poolId: "0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836",
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
    poolId: "0x4f2b6d0a8c1e35947ab30fd2c6e8194a7d5b0c93e21f4867a0dc5b93e1470a52",
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

/** Placeholder wallet data until the indexer + contracts are live. */
export const MOCK_POSITIONS: LpPosition[] = [
  {
    tokenId: 123,
    pair: "ETH/USDG",
    range: "±22%",
    valueUsd: 2_400,
    marketId: "blue-chip",
    inRange: true,
    uncollectedFeesUsd: 12.4,
    composition: "0.41 ETH + 1,205 USDG",
    collateralUsd: 2_400,
    borrowedUsd: 0,
    healthFactor: Infinity,
    status: "healthy",
  },
  {
    tokenId: 98,
    pair: "WETH/USDG",
    range: "±25%",
    valueUsd: 5_150,
    marketId: "blue-chip",
    inRange: true,
    uncollectedFeesUsd: 31.75,
    composition: "0.88 WETH + 2,590 USDG",
    collateralUsd: 5_150,
    borrowedUsd: 2_850,
    healthFactor: 1.35,
    status: "warning",
  },
  {
    tokenId: 45,
    pair: "PONS/USDG",
    range: "±20%",
    valueUsd: 860,
    marketId: "meme",
    inRange: false,
    uncollectedFeesUsd: 3.1,
    composition: "42,800,000 PONS + 0 USDG",
    collateralUsd: 860,
    borrowedUsd: 620,
    healthFactor: 0.55,
    status: "liquidatable",
  },
];

export const MOCK_LIQUIDATIONS: Liquidation[] = [
  {
    id: "liq-001",
    positionId: 45,
    borrower: "0x7a2F…91c4",
    collateral: "PONS/USDG #45",
    debtUsd: 620,
    healthFactor: 0.55,
    threshold: 0.4,
    bonus: 0.1,
    status: "liquidatable",
  },
  {
    id: "liq-002",
    positionId: 98,
    borrower: "0xB40d…2aa8",
    collateral: "WETH/USDG #98",
    debtUsd: 2_850,
    healthFactor: 1.04,
    threshold: 0.75,
    bonus: 0.05,
    status: "at-risk",
  },
  {
    id: "liq-003",
    positionId: 212,
    borrower: "0x1d88…c02e",
    collateral: "ETH/USDG #212",
    debtUsd: 8_140,
    healthFactor: 1.12,
    threshold: 0.75,
    bonus: 0.05,
    status: "warning",
  },
];

export const MOCK_USDG_BALANCE = 5_000;

export const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const fmtUsdExact = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "$312.40K USDG" / "$1.24M USDG", the density the market table reads at. */
export const fmtCompactUsdg = (n: number) =>
  `$${n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : `${(n / 1_000).toFixed(2)}K`} USDG`;

export const fmtUsdg = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * Every activity number above (APY, APR, utilisation, TVL) and every
 * position below is placeholder data: the FarmentaMarket contracts are
 * not deployed yet. Any surface that renders them must say so. A
 * lending UI that shows invented yields without a label is lying.
 */
