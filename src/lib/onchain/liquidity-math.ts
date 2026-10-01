/**
 * What adding liquidity to a position costs, computed the way the pool
 * computes it (FAR-66). Pure: a price, a range, an amount of liquidity.
 *
 * This is Uniswap v4's own arithmetic, in integers, rounded as the pool rounds
 * when liquidity is added: `TickMath.getSqrtPriceAtTick`,
 * `SqrtPriceMath.getAmount0Delta` and `getAmount1Delta` with `roundUp`, and
 * the three branches of `Pool.modifyLiquidity`. The fork tests hold it to the
 * chain: an addition spends what this says, to the unit.
 */
const Q96 = 1n << 96n;
const MAX_UINT256 = (1n << 256n) - 1n;
export const MIN_TICK = -887_272;
export const MAX_TICK = 887_272;

/** 1 / sqrt(1.0001^(2^i)) in Q128.128, for each bit `i` of a tick. The constants of `TickMath`. */
const FACTORS = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
] as const;

/** `sqrt(1.0001^tick) × 2^96`, as `TickMath.getSqrtPriceAtTick` returns it. */
export function sqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) throw new RangeError(`tick ${tick} is out of range`);
  const absTick = Math.abs(tick);

  let price = 1n << 128n;
  FACTORS.forEach((factor, bit) => {
    if (absTick & (1 << bit)) price = (price * factor) >> 128n;
  });
  if (tick > 0) price = MAX_UINT256 / price;
  // Q128.128 to Q64.96, rounding up.
  return (price + (1n << 32n) - 1n) >> 32n;
}

const divUp = (a: bigint, b: bigint) => (a === 0n ? 0n : (a - 1n) / b + 1n);

/** `SqrtPriceMath.getAmount0Delta(…, roundUp = true)`: currency0 between two prices. */
function amount0Up(sqrtA: bigint, sqrtB: bigint, liquidity: bigint) {
  const [low, high] = sqrtA > sqrtB ? [sqrtB, sqrtA] : [sqrtA, sqrtB];
  return divUp(divUp((liquidity << 96n) * (high - low), high), low);
}

/** `SqrtPriceMath.getAmount1Delta(…, roundUp = true)`: currency1 between two prices. */
function amount1Up(sqrtA: bigint, sqrtB: bigint, liquidity: bigint) {
  const [low, high] = sqrtA > sqrtB ? [sqrtB, sqrtA] : [sqrtA, sqrtB];
  return divUp(liquidity * (high - low), Q96);
}

export type PoolPrice = {
  sqrtPriceX96: bigint;
  /** The pool's current tick. The pool decides which side of a range it is on by the tick, not by the price. */
  tick: number;
};

export type Range = { tickLower: number; tickUpper: number };

/**
 * What adding `liquidity` to a position in `range` takes of each currency at
 * the pool's price, as `Pool.modifyLiquidity` charges it: below the range all
 * currency0, above it all currency1, inside it both.
 */
export function amountsToAdd({ sqrtPriceX96, tick }: PoolPrice, { tickLower, tickUpper }: Range, liquidity: bigint) {
  const lower = sqrtPriceAtTick(tickLower);
  const upper = sqrtPriceAtTick(tickUpper);
  if (tick < tickLower) return { need0: amount0Up(lower, upper, liquidity), need1: 0n };
  if (tick < tickUpper) {
    return { need0: amount0Up(sqrtPriceX96, upper, liquidity), need1: amount1Up(lower, sqrtPriceX96, liquidity) };
  }
  return { need0: 0n, need1: amount1Up(lower, upper, liquidity) };
}

/** `amount` plus the tolerance, rounded up. */
export const withTolerance = (amount: bigint, toleranceBps: number) => divUp(amount * BigInt(10_000 + toleranceBps), 10_000n);

/**
 * The need of each currency at the pool's price, and the most the wallet
 * agrees to pay of it: the need plus the slippage tolerance, rounded up
 * (spec §12). The maximum is what the Permit2 permit is signed for and what
 * the market is called with; a currency the addition takes none of has a
 * maximum of zero.
 */
export function additionFor(price: PoolPrice, range: Range, liquidity: bigint, toleranceBps: number) {
  const { need0, need1 } = amountsToAdd(price, range, liquidity);
  return { need0, need1, max0: withTolerance(need0, toleranceBps), max1: withTolerance(need1, toleranceBps) };
}
