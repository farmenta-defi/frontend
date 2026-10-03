import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOLERANCE_BPS,
  liquidityFor,
  minimumsFor,
  parseTolerance,
  REMOVAL_SHARES,
  TOLERANCE_REFUSED_ABOVE_BPS,
  TOLERANCE_WARNING_ABOVE_BPS,
} from "./removal";

/**
 * The arithmetic of a removal. What the pool pays, and what the market
 * refuses, is read from the chain and covered on the fork (test/fork).
 */
const quote = { liquidity: 250n, principal0: 59_660_883_660_322_690n, principal1: 189_449_793n };

describe("the share of a position's liquidity", () => {
  describe("positive", () => {
    it("is that percentage of it", () => {
      expect(liquidityFor(1_000n, 25)).toBe(250n);
      expect(liquidityFor(1_000n, 75)).toBe(750n);
    });
  });

  describe("negative", () => {
    it("does not offer the whole position: that leaves through a repayment and a withdrawal of the collateral", () => {
      expect(REMOVAL_SHARES).toEqual([25, 50, 75]);
      expect(Math.max(...REMOVAL_SHARES)).toBeLessThan(100);
    });
  });

  describe("edge case", () => {
    it("rounds down, so it never asks for more than the share", () => {
      expect(liquidityFor(3n, 25)).toBe(0n);
      expect(liquidityFor(7n, 50)).toBe(3n);
    });
  });
});

describe("the slippage tolerance", () => {
  describe("positive", () => {
    it("is 0.5% unless changed, warned about above 1% and refused above 5% (spec §12)", () => {
      expect(DEFAULT_TOLERANCE_BPS).toBe(50);
      expect(TOLERANCE_WARNING_ABOVE_BPS).toBe(100);
      expect(TOLERANCE_REFUSED_ABOVE_BPS).toBe(500);
    });

    it("is read as a percentage, in basis points", () => {
      expect(parseTolerance("0.5")).toBe(50);
      expect(parseTolerance("1")).toBe(100);
      expect(parseTolerance("0.05")).toBe(5);
      expect(parseTolerance("5.00")).toBe(500);
    });
  });

  describe("negative", () => {
    it("is nothing where what was typed is not a percentage", () => {
      for (const text of ["", ".", ".5", "abc", "1.2.3", "-1", "0.555"]) expect(parseTolerance(text), text).toBeNull();
    });
  });

  describe("edge case", () => {
    it("takes zero, which accepts no slippage at all, and a number being typed", () => {
      expect(parseTolerance("0")).toBe(0);
      expect(parseTolerance("1.")).toBe(100);
      expect(parseTolerance(" 0.5 ")).toBe(50);
    });
  });
});

describe("the minimums a removal is sent with", () => {
  describe("positive", () => {
    it("are the quoted principal less the tolerance, in each token", () => {
      expect(minimumsFor({ ...quote, principal0: 1_000_000n, principal1: 2_000n }, 50)).toEqual({ min0: 995_000n, min1: 1_990n });
    });
  });

  describe("negative", () => {
    it("are never above the quote, whatever the tolerance", () => {
      for (const bps of [0, 1, 50, 100, 500]) {
        const { min0, min1 } = minimumsFor(quote, bps);
        expect(min0, String(bps)).toBeLessThanOrEqual(quote.principal0);
        expect(min1, String(bps)).toBeLessThanOrEqual(quote.principal1);
      }
    });
  });

  describe("edge case", () => {
    it("round down", () => {
      // 0.5% off 199 is 198.005.
      expect(minimumsFor({ ...quote, principal0: 199n, principal1: 1n }, 50)).toEqual({ min0: 198n, min1: 0n });
    });

    it("are the quote itself at a tolerance of zero", () => {
      expect(minimumsFor(quote, 0)).toEqual({ min0: quote.principal0, min1: quote.principal1 });
    });

    it("are nothing for a token the removal pays none of, as an out-of-range position does", () => {
      expect(minimumsFor({ ...quote, principal0: 0n }, 50).min0).toBe(0n);
    });
  });
});
