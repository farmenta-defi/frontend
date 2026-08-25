/**
 * Market + LP-position domain model with mock data. The market UI reads only
 * from these exports, so swapping to live wagmi/indexer reads later is a
 * data-layer change — the components stay untouched.
 */

export type Market = {
  id: string;
  name: string;
  collateral: string;
  supplyApy: number; // %
  borrowApr: number; // %
  utilization: number; // %
  tvlUsd: number;
  maxLtv: number; // 0..1 — max borrow against collateral value
  liqThreshold: number; // 0..1 — HF hits 1.0 when debt reaches value × this
  reserveFactor: number; // %
  oracle: "CHAINLINK" | "TWAP";
};

export type LpPosition = {
  tokenId: number;
  pair: string;
  range: string;
  valueUsd: number;
  marketId: string;
  inRange: boolean;
  uncollectedFeesUsd: number;
  composition: string; // human-readable token breakdown of the position
};

export const MARKETS: Market[] = [
  {
    id: "blue-chip",
    name: "BLUE CHIP USDG",
    collateral: "ETH/USDG · WETH/USDG",
    supplyApy: 4.2,
    borrowApr: 6.1,
    utilization: 62,
    tvlUsd: 1_240_000,
    maxLtv: 0.7,
    liqThreshold: 0.8,
    reserveFactor: 15,
    oracle: "CHAINLINK",
  },
  {
    id: "meme",
    name: "MEME USDG",
    collateral: "MEME/USDG (allowlisted)",
    supplyApy: 9.8,
    borrowApr: 14.3,
    utilization: 71,
    tvlUsd: 342_000,
    maxLtv: 0.5,
    liqThreshold: 0.65,
    reserveFactor: 25,
    oracle: "TWAP",
  },
];

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
  },
  {
    tokenId: 45,
    pair: "PEPE/USDG",
    range: "±20%",
    valueUsd: 860,
    marketId: "meme",
    inRange: false,
    uncollectedFeesUsd: 3.1,
    composition: "42,800,000 PEPE + 0 USDG",
  },
];

export const MOCK_USDG_BALANCE = 5_000;

export const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const fmtUsdExact = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtUsdg = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });
