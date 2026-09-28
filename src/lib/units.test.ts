import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";

import {
  bpsToFraction,
  formatUsdg,
  healthFactorToNumber,
  parseUsdg,
  usdgToNumber,
  wadToNumber,
} from "./units";

describe("parseUsdg", () => {
  describe("positive", () => {
    it("reads whole and fractional amounts in 6 decimals", () => {
      expect(parseUsdg("100")).toBe(100_000_000n);
      expect(parseUsdg("0.5")).toBe(500_000n);
      expect(parseUsdg("1250.123456")).toBe(1_250_123_456n);
    });

    it("reads what the amount field lets through: a trailing or a leading point, separators", () => {
      expect(parseUsdg("12.")).toBe(12_000_000n);
      expect(parseUsdg(".25")).toBe(250_000n);
      expect(parseUsdg("1,250.50")).toBe(1_250_500_000n);
    });
  });

  describe("negative", () => {
    it("refuses what is not an amount", () => {
      for (const input of ["", " ", ".", "abc", "1e6", "-5", "1.2.3", "0x10"]) {
        expect(parseUsdg(input), input).toBeNull();
      }
    });

    it("refuses a seventh decimal instead of rounding it", () => {
      expect(parseUsdg("1.0000001")).toBeNull();
      expect(parseUsdg("0.1234567")).toBeNull();
    });
  });

  describe("edge case", () => {
    it("keeps an amount no float can hold", () => {
      // 2^53 + 1 USDG: Number() would silently return 9007199254740992.
      expect(parseUsdg("9007199254740993.000001")).toBe(9_007_199_254_740_993_000_001n);
    });

    it("reads zero as zero, which the gates then refuse", () => {
      expect(parseUsdg("0")).toBe(0n);
      expect(parseUsdg("0.000000")).toBe(0n);
    });

    it("reads the smallest unit", () => {
      expect(parseUsdg("0.000001")).toBe(1n);
    });
  });
});

describe("formatting", () => {
  describe("positive", () => {
    it("round-trips an amount through the input field", () => {
      for (const amount of [1n, 999_999n, 1_000_000n, 1_250_123_456n]) {
        expect(parseUsdg(formatUsdg(amount))).toBe(amount);
      }
    });

    it("turns the three scales into display numbers", () => {
      expect(usdgToNumber(1_250_500_000n)).toBe(1250.5);
      expect(wadToNumber(1_350_000_000_000_000_000n)).toBe(1.35);
      expect(bpsToFraction(6500)).toBe(0.65);
      expect(bpsToFraction(7500n)).toBe(0.75);
    });
  });

  describe("negative", () => {
    it("does not print a fraction the amount does not have", () => {
      expect(formatUsdg(100_000_000n)).toBe("100");
    });
  });

  describe("edge case", () => {
    it("reads a loan without debt as infinitely healthy, not as a 78-digit number", () => {
      expect(healthFactorToNumber(maxUint256)).toBe(Infinity);
      expect(healthFactorToNumber(maxUint256 - 1n)).not.toBe(Infinity);
    });

    it("reads a health factor of exactly one", () => {
      expect(healthFactorToNumber(1_000_000_000_000_000_000n)).toBe(1);
    });
  });
});
