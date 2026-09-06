/**
 * Risk parameters per isolated market, copied verbatim from
 * farmenta-defi/docs → ARCHITECTURE.md §6.2 (v0.3, 26 Aug 2026).
 *
 * Single source of truth for the UI: both the Risk page table and the
 * market mock data read from here, so the numbers cannot drift apart.
 * When the spec changes, update this file only.
 */

export type MarketTier = "blue-chip" | "meme";

export type RiskParams = {
  maxLtv: number; // 0..1 — max borrow against collateral value
  liqThreshold: number; // 0..1 — HF hits 1.0 when debt reaches value × this
  liquidatorBonus: number; // 0..1, net
  protocolLiqFeePct: number; // % of repay, paid by liquidator into reserves
  closeFactor: string;
  poolDebtCap: string;
  marketDebtCapUsd: number; // initial
  minDebtUsd: number;
  minPositionUsd: number;
  spotRuleAtBorrow: string;
  feeCapPctOfPrincipal: number; // uncollected fees counted for borrow
  priceSource: string;
  oracle: "CHAINLINK" | "TWAP";
  reserveFactorPct: number;
  irm: { kinkPct: number; slope1Pct: number; slope2Pct: number };
};

export const RISK_PARAMS: Record<MarketTier, RiskParams> = {
  "blue-chip": {
    maxLtv: 0.65,
    liqThreshold: 0.75,
    liquidatorBonus: 0.05,
    protocolLiqFeePct: 0.5,
    closeFactor: "50% (100% if HF < 0.9 or debt < $100)",
    poolDebtCap: "≤ 10% of pool TVL",
    marketDebtCapUsd: 500_000,
    minDebtUsd: 10,
    minPositionUsd: 50,
    spotRuleAtBorrow: "spot within ±2% of oracle",
    feeCapPctOfPrincipal: 10,
    priceSource: "Chainlink (Pyth check when fresh)",
    oracle: "CHAINLINK",
    reserveFactorPct: 15,
    irm: { kinkPct: 80, slope1Pct: 4, slope2Pct: 60 },
  },
  meme: {
    maxLtv: 0.3,
    liqThreshold: 0.4,
    liquidatorBonus: 0.1,
    protocolLiqFeePct: 2,
    closeFactor: "100%",
    poolDebtCap: "≤ 5% of pool TVL, max $20k",
    marketDebtCapUsd: 50_000,
    minDebtUsd: 10,
    minPositionUsd: 50,
    spotRuleAtBorrow: "min(spot, TWAP)",
    feeCapPctOfPrincipal: 10,
    priceSource: "30-min TWAP × USDG price",
    oracle: "TWAP",
    reserveFactorPct: 25,
    irm: { kinkPct: 70, slope1Pct: 8, slope2Pct: 100 },
  },
};
