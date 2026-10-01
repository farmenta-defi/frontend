import { formatUnits } from "viem";

import { fmtAmount } from "@/lib/format";
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
   * USD the position has earned and not collected, in full. The market lends
   * against these fees only up to a tenth of the principal (spec §6.2), so on
   * collateral this is a figure of its own and not a part of `valueUsd`.
   * Absent when the position could not be valued.
   */
  feesUsd: number | null;
  /**
   * What the position holds, in whole tokens: of USDG, and of the token
   * paired with it. Told apart by address, because USDG is currency0 in some
   * pools and currency1 in others. Absent when the position could not be
   * valued, or when neither currency is USDG.
   */
  amounts: { base: number; usdg: number } | null;
  /**
   * The uncollected fees in whole tokens, split the same way: what collecting
   * them pays out. Absent where `amounts` is.
   */
  fees: { base: number; usdg: number } | null;
};

/** Two amounts of the pool's currencies as the pair names them: the other token first, USDG second. */
function byPair(
  position: PositionState,
  pick: (holdings: NonNullable<PositionState["holdings"]>) => readonly [bigint, bigint],
): { base: number; usdg: number } | null {
  const { poolKey, holdings, decimals } = position;
  if (!poolKey || !holdings || !decimals) return null;

  const usdg = position.asset.toLowerCase();
  const usdgIsCurrency0 = poolKey.currency0.toLowerCase() === usdg;
  if (!usdgIsCurrency0 && poolKey.currency1.toLowerCase() !== usdg) return null;

  const [of0, of1] = pick(holdings);
  const amount0 = Number(formatUnits(of0, decimals[0]));
  const amount1 = Number(formatUnits(of1, decimals[1]));
  return usdgIsCurrency0 ? { base: amount1, usdg: amount0 } : { base: amount0, usdg: amount1 };
}

/**
 * The fees as the button that collects them names them: "0.0005 ETH and 1.29 USDG", or the
 * one token there is any of. `null` where there is nothing to name.
 */
export function feesInWords(fees: PositionDescription["fees"], baseSymbol: string): string | null {
  if (!fees) return null;
  const parts = [
    fees.base > 0 ? `${fmtAmount(fees.base)} ${baseSymbol}` : null,
    fees.usdg > 0 ? `${fmtAmount(fees.usdg)} USDG` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" and ") : null;
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
    feesUsd: position.holdings ? wadToNumber(position.holdings.feesUsd) : null,
    amounts: byPair(position, (holdings) => [holdings.amount0, holdings.amount1]),
    fees: byPair(position, (holdings) => [holdings.fees0, holdings.fees1]),
  };
}
