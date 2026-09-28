import { zeroAddress, type Address } from "viem";

import type { PoolKey } from "./contracts";

/**
 * What a position is, in the words a liquidity provider knows it by: the
 * pair's fee and the price range, not the token id.
 */

/** Uniswap v4 marks a pool whose fee a hook sets per swap with this value in `fee`. */
const DYNAMIC_FEE = 0x800000;

/** The widest ticks a position can have; a range that reaches them is "full range". */
const MIN_TICK = -887_272;
const MAX_TICK = 887_272;

/** "0.046%" for a fee of 460 hundredths of a basis point; "Dynamic fee" when a hook sets it. */
export function feeLabel(fee: number): string {
  if (fee === DYNAMIC_FEE) return "Dynamic fee";
  // Up to four decimals, without trailing zeros: 3000 is "0.3%", 460 is "0.046%".
  return `${Number((fee / 10_000).toFixed(4))}%`;
}

/**
 * The two ticks of a position, from the packed `PositionInfo` PositionManager
 * returns: 200 bits of pool id, then `tickUpper` and `tickLower` as int24, then
 * 8 bits of flags.
 */
export function ticksOf(info: bigint): { tickLower: number; tickUpper: number } {
  const int24 = (value: bigint) => Number(BigInt.asIntN(24, value));
  return { tickLower: int24(info >> 8n), tickUpper: int24(info >> 32n) };
}

/** currency1 per currency0 at `tick`, in whole tokens. */
const priceAt = (tick: number, decimals0: number, decimals1: number) =>
  Math.pow(1.0001, tick) * Math.pow(10, decimals0 - decimals1);

export type PriceRange =
  | { full: true }
  | {
      full: false;
      /** The price of the pair's other token in `quote`, at the two ends of the range. */
      low: number;
      high: number;
    };

/**
 * The range as prices in `quote` (USDG), whichever side of the pool USDG is
 * on. A pool orders its currencies by address, so USDG is currency1 next to
 * native ETH and may be currency0 next to another token; there the prices
 * invert and the ends swap.
 */
export function priceRange(
  key: PoolKey,
  ticks: { tickLower: number; tickUpper: number },
  decimals: readonly [number, number],
  quote: Address,
): PriceRange {
  const lowest = Math.ceil(MIN_TICK / key.tickSpacing) * key.tickSpacing;
  const highest = Math.floor(MAX_TICK / key.tickSpacing) * key.tickSpacing;
  if (ticks.tickLower <= lowest && ticks.tickUpper >= highest) return { full: true };

  const lower = priceAt(ticks.tickLower, decimals[0], decimals[1]);
  const upper = priceAt(ticks.tickUpper, decimals[0], decimals[1]);
  const quoteIsCurrency0 = key.currency0.toLowerCase() === quote.toLowerCase();
  return quoteIsCurrency0 ? { full: false, low: 1 / upper, high: 1 / lower } : { full: false, low: lower, high: upper };
}

/** "2,310 to 2,790" with as many digits as the size of the price calls for. */
export function rangeLabel(range: PriceRange): string {
  if (range.full) return "Full range";
  const figure = (price: number) =>
    price.toLocaleString("en-US", { maximumSignificantDigits: price >= 1_000 ? 5 : 4 });
  return `${figure(range.low)} to ${figure(range.high)}`;
}

/** Native ETH has no contract to ask; every other currency reports its own decimals. */
export const isNative = (currency: Address) => currency === zeroAddress;
