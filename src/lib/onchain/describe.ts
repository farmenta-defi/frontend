import { formatUnits } from "viem";

import { wadToNumber } from "@/lib/units";

import { feeLabel, priceRange, rangeLabel } from "./range";
import type { PositionState } from "./reads";

/**
 * What a row says about a position, in the words its owner knows it by: the
 * fee, the price range, whether the price is in it, and what it is worth.
 */
export type PositionDescription = {
  /** "0.046%". Absent when the token is missing. */
  fee: string | null;
  /** "2,310 to 2,790 USDG", or "Full range". */
  range: string | null;
  /** Absent when nothing can be said: the valuer could not price the position, or it holds nothing. */
  inRange: boolean | null;
  /** USD. Absent when the position could not be valued. */
  valueUsd: number | null;
  /**
   * What the position holds, in whole tokens: of USDG, and of the token
   * paired with it. Told apart by address, because USDG is currency0 in some
   * pools and currency1 in others. Absent when the position could not be
   * valued, or when neither currency is USDG.
   */
  amounts: { base: number; usdg: number } | null;
};

/** The pool's two amounts as the pair names them: the other token first, USDG second. */
function amountsOf(position: PositionState): PositionDescription["amounts"] {
  const { poolKey, holdings, decimals } = position;
  if (!poolKey || !holdings || !decimals) return null;

  const usdg = position.asset.toLowerCase();
  const usdgIsCurrency0 = poolKey.currency0.toLowerCase() === usdg;
  if (!usdgIsCurrency0 && poolKey.currency1.toLowerCase() !== usdg) return null;

  const amount0 = Number(formatUnits(holdings.amount0, decimals[0]));
  const amount1 = Number(formatUnits(holdings.amount1, decimals[1]));
  return usdgIsCurrency0 ? { base: amount1, usdg: amount0 } : { base: amount0, usdg: amount1 };
}

export function describePosition(position: PositionState): PositionDescription {
  const range =
    position.poolKey && position.ticks && position.decimals
      ? rangeLabel(priceRange(position.poolKey, position.ticks, position.decimals, position.asset))
      : null;

  // The valuer splits the position at the oracle's price: both tokens held means the price is
  // inside the range, one token means it is outside. Neither token means there is no liquidity
  // to split, which says nothing about where the price is.
  const { amount0, amount1 } = position.holdings ?? { amount0: 0n, amount1: 0n };
  const inRange = amount0 === 0n && amount1 === 0n ? null : amount0 > 0n && amount1 > 0n;

  // Collateral is worth what the market lends against; a position in the wallet, what it holds
  // with its uncollected fees.
  const valueUsd = position.risk
    ? wadToNumber(position.risk.positionValue)
    : position.holdings
      ? wadToNumber(position.holdings.principalUsd + position.holdings.feesUsd)
      : null;

  return {
    fee: position.poolKey ? feeLabel(position.poolKey.fee) : null,
    range: range === null ? null : range === "Full range" ? range : `${range} USDG`,
    inRange,
    valueUsd,
    amounts: amountsOf(position),
  };
}
