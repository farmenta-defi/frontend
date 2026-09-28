import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import type { PoolKey } from "./contracts";
import { feeLabel, priceRange, rangeLabel, ticksOf } from "./range";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ETH_USDG: PoolKey = { currency0: zeroAddress, currency1: USDG, fee: 460, tickSpacing: 9, hooks: zeroAddress };
/** A token whose address sorts after USDG's, which makes USDG currency0. */
const TOKEN = "0x7384d1F183526d83aad28bA5A5eD6dceeA211E18";
const USDG_TOKEN: PoolKey = { currency0: USDG, currency1: TOKEN, fee: 3000, tickSpacing: 60, hooks: zeroAddress };

/** Packs ticks the way PositionInfoLibrary does: poolId (200) | tickUpper (24) | tickLower (24) | flags (8). */
const pack = (tickLower: number, tickUpper: number, poolId = 0xabcdefn, flags = 1n) =>
  (poolId << 56n) | (BigInt.asUintN(24, BigInt(tickUpper)) << 32n) | (BigInt.asUintN(24, BigInt(tickLower)) << 8n) | flags;

describe("feeLabel", () => {
  describe("positive", () => {
    it("reads the fees of the two listed pools as the review names them", () => {
      expect(feeLabel(460)).toBe("0.046%");
      expect(feeLabel(200)).toBe("0.02%");
    });
  });

  describe("negative", () => {
    it("does not print a hook's fee flag as a fee of 838.8608%", () => {
      expect(feeLabel(0x800000)).toBe("Dynamic fee");
    });
  });

  describe("edge case", () => {
    it("drops trailing zeros and keeps the smallest fee", () => {
      expect(feeLabel(3000)).toBe("0.3%");
      expect(feeLabel(10_000)).toBe("1%");
      expect(feeLabel(1)).toBe("0.0001%");
      expect(feeLabel(0)).toBe("0%");
    });
  });
});

describe("ticksOf", () => {
  describe("positive", () => {
    it("unpacks both ticks of a position in the ETH/USDG pool", () => {
      expect(ticksOf(pack(-199_800, -197_100))).toEqual({ tickLower: -199_800, tickUpper: -197_100 });
    });
  });

  describe("negative", () => {
    it("is not thrown off by the pool id above the ticks or the flags below them", () => {
      const ticks = { tickLower: -60, tickUpper: 120 };
      expect(ticksOf(pack(-60, 120, 2n ** 200n - 1n, 0xffn))).toEqual(ticks);
      expect(ticksOf(pack(-60, 120, 0n, 0n))).toEqual(ticks);
    });
  });

  describe("edge case", () => {
    it("keeps the sign of each tick on its own", () => {
      expect(ticksOf(pack(-887_272, 887_272))).toEqual({ tickLower: -887_272, tickUpper: 887_272 });
      expect(ticksOf(pack(-1, 0))).toEqual({ tickLower: -1, tickUpper: 0 });
    });
  });
});

describe("priceRange", () => {
  describe("positive", () => {
    it("prices ETH in USDG: tick -198,599 is about $2,373, the pool's tick when the spec wrote ETH at about $2,400", () => {
      const range = priceRange(ETH_USDG, { tickLower: -198_599, tickUpper: -198_599 + 900 }, [18, 6], USDG);

      expect(range.full).toBe(false);
      if (range.full) return;
      expect(range.low).toBeGreaterThan(2_370);
      expect(range.low).toBeLessThan(2_376);
      // 900 ticks is 1.0001^900, about 9.4% higher.
      expect(range.high / range.low).toBeCloseTo(Math.pow(1.0001, 900), 10);
    });
  });

  describe("negative", () => {
    it("does not call a range full that stops one spacing short of the widest", () => {
      expect(priceRange(ETH_USDG, { tickLower: -887_256, tickUpper: 887_265 }, [18, 6], USDG).full).toBe(false);
      expect(priceRange(ETH_USDG, { tickLower: -887_265, tickUpper: 887_256 }, [18, 6], USDG).full).toBe(false);
    });
  });

  describe("edge case", () => {
    it("inverts when USDG is currency0, and the lower tick becomes the higher price", () => {
      // 1.0001^23,028 is about 10 TOKEN per USDG, so TOKEN costs about 0.10 USDG.
      const range = priceRange(USDG_TOKEN, { tickLower: 23_028 - 600, tickUpper: 23_028 + 600 }, [6, 6], USDG);

      expect(range.full).toBe(false);
      if (range.full) return;
      expect(range.low).toBeLessThan(0.1);
      expect(range.high).toBeGreaterThan(0.1);
      expect(range.low * range.high).toBeCloseTo(0.01, 3);
    });

    it("calls the widest ticks the spacing allows full range", () => {
      // 887,272 rounded toward zero onto the spacing: 887,265 for 9, 887,220 for 60.
      expect(priceRange(ETH_USDG, { tickLower: -887_265, tickUpper: 887_265 }, [18, 6], USDG).full).toBe(true);
      expect(priceRange(USDG_TOKEN, { tickLower: -887_220, tickUpper: 887_220 }, [6, 6], USDG).full).toBe(true);
    });
  });
});

describe("rangeLabel", () => {
  describe("positive", () => {
    it("writes both ends", () => {
      expect(rangeLabel({ full: false, low: 2_310.4, high: 2_790.9 })).toBe("2,310.4 to 2,790.9");
    });
  });

  describe("negative", () => {
    it("does not print prices for a full range", () => {
      expect(rangeLabel({ full: true })).toBe("Full range");
    });
  });

  describe("edge case", () => {
    it("keeps the digits of a price far below one", () => {
      expect(rangeLabel({ full: false, low: 0.00001234, high: 0.0000456 })).toBe("0.00001234 to 0.0000456");
    });
  });
});
