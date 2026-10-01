import { describe, expect, it } from "vitest";

import { additionFor, amountsToAdd, MAX_TICK, MIN_TICK, sqrtPriceAtTick, withTolerance } from "./liquidity-math";

/**
 * The arithmetic of an addition, against figures of Uniswap's own: the two
 * ends of `TickMath`, and amounts worked out by hand from its formulas. That
 * the pool charges exactly this is held on the fork (test/fork).
 */
const Q96 = 1n << 96n;

describe("sqrtPriceAtTick", () => {
  describe("positive", () => {
    it("is 2^96 at tick zero, and TickMath's own bounds at its two ends", () => {
      expect(sqrtPriceAtTick(0)).toBe(Q96);
      // TickMath.MIN_SQRT_PRICE and MAX_SQRT_PRICE.
      expect(sqrtPriceAtTick(MIN_TICK)).toBe(4_295_128_739n);
      expect(sqrtPriceAtTick(MAX_TICK)).toBe(1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n);
    });

    it("moves by the square root of one basis point a tick", () => {
      expect(sqrtPriceAtTick(1)).toBe(79_232_123_823_359_799_118_286_999_568n);
      expect(sqrtPriceAtTick(-1)).toBe(79_224_201_403_219_477_170_569_942_574n);
    });
  });

  describe("negative", () => {
    it("refuses a tick outside the range a pool can have, and one that is not whole", () => {
      for (const tick of [MIN_TICK - 1, MAX_TICK + 1, 0.5, Number.NaN]) {
        expect(() => sqrtPriceAtTick(tick), String(tick)).toThrow(RangeError);
      }
    });
  });

  describe("edge case", () => {
    it("rises with the tick, across zero and at every bit of it", () => {
      const ticks = [-887_272, -524_288, -70_000, -1, 0, 1, 2, 3, 4, 255, 256, 65_535, 65_536, 524_287, 887_272];
      const prices = ticks.map(sqrtPriceAtTick);
      for (let i = 1; i < prices.length; i++) expect(prices[i], String(ticks[i])).toBeGreaterThan(prices[i - 1]);
    });

    it("is the inverse of itself across zero, to one part in a million million", () => {
      for (const tick of [1, 60, 4_055, 200_000]) {
        const product = (sqrtPriceAtTick(tick) * sqrtPriceAtTick(-tick)) / Q96;
        const off = product > Q96 ? product - Q96 : Q96 - product;
        expect(off * 10n ** 12n, String(tick)).toBeLessThan(Q96);
      }
    });
  });
});

describe("what an addition takes of each currency", () => {
  // A range of one tick spacing either side of price 1, and liquidity of 1e18.
  const range = { tickLower: -60, tickUpper: 60 };
  const L = 10n ** 18n;
  const lower = sqrtPriceAtTick(-60);
  const upper = sqrtPriceAtTick(60);
  const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;

  describe("positive", () => {
    it("is both currencies inside the range, each from the price to its own end", () => {
      const { need0, need1 } = amountsToAdd({ sqrtPriceX96: Q96, tick: 0 }, range, L);

      // currency0 from the price up to the top, currency1 from the bottom up to the price.
      expect(need0).toBe(ceil(ceil((L << 96n) * (upper - Q96), upper), Q96));
      expect(need1).toBe(ceil(L * (Q96 - lower), Q96));
      // 60 ticks is 0.3% of the square root of the price: about 0.003 of each for a liquidity of 1.
      expect(need0).toBeGreaterThan(2_990_000_000_000_000n);
      expect(need0).toBeLessThan(3_010_000_000_000_000n);
      expect(need1).toBeGreaterThan(2_990_000_000_000_000n);
      expect(need1).toBeLessThan(3_010_000_000_000_000n);
    });
  });

  describe("negative", () => {
    it("is currency0 alone while the pool's tick is below the range", () => {
      const { need0, need1 } = amountsToAdd({ sqrtPriceX96: sqrtPriceAtTick(-120), tick: -120 }, range, L);

      expect(need1).toBe(0n);
      expect(need0).toBe(ceil(ceil((L << 96n) * (upper - lower), upper), lower));
    });

    it("is currency1 alone while the pool's tick is at or above the top of the range", () => {
      for (const tick of [60, 120]) {
        const { need0, need1 } = amountsToAdd({ sqrtPriceX96: sqrtPriceAtTick(tick), tick }, range, L);

        expect(need0, String(tick)).toBe(0n);
        expect(need1, String(tick)).toBe(ceil(L * (upper - lower), Q96));
      }
    });
  });

  describe("edge case", () => {
    it("goes by the pool's tick, as the pool does: at the bottom tick exactly it is inside, and takes no currency1", () => {
      const { need0, need1 } = amountsToAdd({ sqrtPriceX96: lower, tick: -60 }, range, L);

      expect(need1).toBe(0n);
      expect(need0).toBeGreaterThan(0n);
    });

    it("is above the range from the top tick on, wherever inside that tick the price is", () => {
      // A price a little into tick 60: the tick says above, and the pool takes currency1 only.
      const inside = { sqrtPriceX96: (upper + sqrtPriceAtTick(61)) / 2n, tick: 60 };
      const { need0, need1 } = amountsToAdd(inside, range, L);

      expect(need0).toBe(0n);
      expect(need1).toBe(ceil(L * (upper - lower), Q96));
    });

    it("is below the range up to the tick under the bottom one, however close the price is to it", () => {
      const under = { sqrtPriceX96: lower - 1n, tick: -61 };

      expect(amountsToAdd(under, range, L).need1).toBe(0n);
    });

    it("rounds up, so the pool is never asked for less than it charges", () => {
      // The smallest liquidity there is still costs a unit of each.
      expect(amountsToAdd({ sqrtPriceX96: Q96, tick: 0 }, range, 1n)).toEqual({ need0: 1n, need1: 1n });
    });

    it("is nothing for no liquidity", () => {
      expect(amountsToAdd({ sqrtPriceX96: Q96, tick: 0 }, range, 0n)).toEqual({ need0: 0n, need1: 0n });
    });

    it("costs more currency0 and less currency1 the lower the price is in the range", () => {
      const low = amountsToAdd({ sqrtPriceX96: sqrtPriceAtTick(-30), tick: -30 }, range, L);
      const high = amountsToAdd({ sqrtPriceX96: sqrtPriceAtTick(30), tick: 30 }, range, L);

      expect(low.need0).toBeGreaterThan(high.need0);
      expect(low.need1).toBeLessThan(high.need1);
    });
  });
});

describe("the maximums an addition is signed for", () => {
  const price = { sqrtPriceX96: Q96, tick: 0 };
  const range = { tickLower: -60, tickUpper: 60 };

  describe("positive", () => {
    it("are the need at the pool's price plus the tolerance, of each currency", () => {
      const { need0, need1, max0, max1 } = additionFor(price, range, 10n ** 18n, 50);

      expect({ need0, need1 }).toEqual(amountsToAdd(price, range, 10n ** 18n));
      expect(max0).toBe(withTolerance(need0, 50));
      expect(max1).toBe(withTolerance(need1, 50));
      expect(withTolerance(1_000_000n, 50)).toBe(1_005_000n);
    });
  });

  describe("negative", () => {
    it("are never under the need, whatever the tolerance", () => {
      for (const bps of [0, 1, 50, 100, 500]) {
        const { need0, need1, max0, max1 } = additionFor(price, range, 123_456_789n, bps);
        expect(max0, String(bps)).toBeGreaterThanOrEqual(need0);
        expect(max1, String(bps)).toBeGreaterThanOrEqual(need1);
      }
    });
  });

  describe("edge case", () => {
    it("round up", () => {
      // 0.5% on 199 is 199.995.
      expect(withTolerance(199n, 50)).toBe(200n);
      expect(withTolerance(1n, 1)).toBe(2n);
    });

    it("are the need itself at a tolerance of zero", () => {
      const { need0, need1, max0, max1 } = additionFor(price, range, 10n ** 18n, 0);
      expect({ max0, max1 }).toEqual({ max0: need0, max1: need1 });
    });

    it("are zero for a currency the addition takes none of, so nothing is approved or permitted for it", () => {
      const below = additionFor({ sqrtPriceX96: sqrtPriceAtTick(-120), tick: -120 }, range, 10n ** 18n, 50);
      expect(below.max1).toBe(0n);
      expect(below.max0).toBeGreaterThan(0n);
    });
  });
});
