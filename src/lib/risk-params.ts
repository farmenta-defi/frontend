/**
 * Risk parameters per isolated market, copied from
 * farmenta-defi/docs → ARCHITECTURE.md §6.2 (**v0.9**, 7 Sep 2026).
 *
 * Single source of truth for the UI: the Risk page table and the market
 * mock data both read from here, so the numbers cannot drift apart.
 * When the spec changes, update this file only.
 *
 * Two things changed since the v0.3 snapshot this file used to carry:
 *
 * 1. The protocol liquidation fee is no longer a stored parameter. It is
 *    derived as `liquidatorBonusBps / 10`, so a pool listed with a
 *    tighter bonus automatically pays a larger protocol fee with no
 *    owner action. Meme therefore drops from 2% to 1% of repay, and a
 *    liquidator's net margin is 90% of the bonus in every tier.
 * 2. A reserve floor was added (§7): a share of `totalAssets`, not of
 *    `totalBorrows`, that `withdrawReserves` cannot touch.
 *
 * Since v0.5 these numbers are **presets and simultaneously the loosest
 * bounds**. Each listed pool stores its own parameters, and the contract
 * only accepts deviations that are stricter: lower maxLTV and LT, higher
 * liquidator bonus, smaller caps, larger minimum position.
 */

export type MarketTier = "blue-chip" | "meme";

export type RiskParams = {
  maxLtv: number; // 0..1, max borrow against collateral value
  liqThreshold: number; // 0..1, HF hits 1.0 when debt reaches value × this
  liquidatorBonus: number; // 0..1, net
  /** Derived, not stored: liquidatorBonus / 10, paid by the liquidator into reserves. */
  protocolLiqFeePct: number; // % of repay
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
  /** §7: floor on reserves as a share of totalAssets; not withdrawable. */
  reserveFloorPct: number;
  irm: { kinkPct: number; slope1Pct: number; slope2Pct: number };
};

const derivedProtocolFeePct = (bonus: number) => (bonus * 100) / 10;

export const RISK_PARAMS: Record<MarketTier, RiskParams> = {
  "blue-chip": {
    maxLtv: 0.65,
    liqThreshold: 0.75,
    liquidatorBonus: 0.05,
    protocolLiqFeePct: derivedProtocolFeePct(0.05), // 0.5%
    closeFactor: "50%, or 100% if HF < 0.9 or debt < $100",
    poolDebtCap: "≤ 10% of pool TVL",
    marketDebtCapUsd: 500_000,
    minDebtUsd: 10,
    minPositionUsd: 50,
    spotRuleAtBorrow: "spot within ±2% of oracle",
    feeCapPctOfPrincipal: 10,
    priceSource: "Chainlink (Pyth cross-check when fresh)",
    oracle: "CHAINLINK",
    reserveFactorPct: 15,
    reserveFloorPct: 1,
    irm: { kinkPct: 80, slope1Pct: 4, slope2Pct: 60 },
  },
  meme: {
    maxLtv: 0.3,
    liqThreshold: 0.4,
    liquidatorBonus: 0.1,
    protocolLiqFeePct: derivedProtocolFeePct(0.1), // 1%
    closeFactor: "100%",
    poolDebtCap: "≤ 5% of pool TVL, max $20k",
    marketDebtCapUsd: 50_000,
    minDebtUsd: 10,
    minPositionUsd: 50,
    spotRuleAtBorrow: "min(spot, 30-min TWAP)",
    feeCapPctOfPrincipal: 10,
    priceSource: "30-min TWAP × USDG price",
    oracle: "TWAP",
    reserveFactorPct: 25,
    reserveFloorPct: 2.5,
    irm: { kinkPct: 70, slope1Pct: 8, slope2Pct: 100 },
  },
};

/** Version of ARCHITECTURE.md these numbers were copied from. */
export const SPEC_VERSION = "v0.9";
