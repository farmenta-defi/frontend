import { bpsToFraction, healthFactorToNumber, usdgToNumber, wadToNumber } from "@/lib/units";

import type { PositionState } from "./reads";

/**
 * What a loan would look like after the amount in the field, for the summary
 * under it. For showing only: the transaction is sized from the chain's own
 * figures and judged by the contract, not by this arithmetic.
 *
 * The lens reports the collateral in USD and the debt in USDG, and the market
 * converts between them at the oracle's USDG price. That price is not read
 * separately; it is recovered from what the lens already answered, so the
 * preview agrees with `healthFactor` and `maxBorrow` at the amounts they were
 * computed for.
 */
export type LoanPreview = {
  /** USDG owed after the action. */
  debt: number;
  /** Collateral value the market lends against, USD. */
  collateralUsd: number;
  /** Debt over collateral, 0..1. Zero without debt. */
  ltv: number;
  /** Infinity without debt. */
  healthFactor: number;
  /** The pool's liquidation threshold, 0..1. */
  liquidationLtv: number;
};

/** Dollars per USDG as the oracle has it, recovered from the lens's answers. */
function usdgPrice(position: PositionState, collateralUsd: number, maxLtv: number, lt: number) {
  const debt = usdgToNumber(position.debt);
  const healthFactor = healthFactorToNumber(position.risk!.healthFactor);
  if (debt > 0 && Number.isFinite(healthFactor) && healthFactor > 0) return (collateralUsd * lt) / healthFactor / debt;

  const maxBorrow = usdgToNumber(position.risk!.maxBorrow);
  if (debt === 0 && maxBorrow > 0) return (collateralUsd * maxLtv) / maxBorrow;
  return 1;
}

/** `change` is USDG base units: positive to borrow more, negative to repay. */
export function previewLoan(position: PositionState, change: bigint): LoanPreview | null {
  if (position.place !== "collateral" || !position.risk || !position.pool.terms) return null;

  const collateralUsd = wadToNumber(position.risk.positionValue);
  const maxLtv = bpsToFraction(position.pool.terms.maxLtvBps);
  const liquidationLtv = bpsToFraction(position.pool.terms.ltBps);
  const owed = position.debt + change;
  const debt = usdgToNumber(owed > 0n ? owed : 0n);

  const debtUsd = debt * usdgPrice(position, collateralUsd, maxLtv, liquidationLtv);
  if (debtUsd === 0 || collateralUsd === 0) {
    return { debt, collateralUsd, ltv: 0, healthFactor: debtUsd === 0 ? Infinity : 0, liquidationLtv };
  }
  return {
    debt,
    collateralUsd,
    ltv: debtUsd / collateralUsd,
    healthFactor: (collateralUsd * liquidationLtv) / debtUsd,
    liquidationLtv,
  };
}
