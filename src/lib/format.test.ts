import { describe, expect, it } from "vitest";

import { compactParts, compactTick, fmtCompactUsdg, fmtPct, fmtUsd, fmtUsdExact, fmtUsdg, NO_FIGURE, orDash, shortAddress } from "./format";

describe("format", () => {
  describe("positive", () => {
    it("writes an amount at the magnitude it is read at", () => {
      expect(compactParts(1_240_000)).toEqual({ figure: "1.24", unit: "M" });
      expect(compactParts(312_400)).toEqual({ figure: "312.40", unit: "K" });
      expect(fmtCompactUsdg(25_000)).toBe("25.00K USDG");
      expect(compactTick(1_500_000)).toBe("1.5M");
      expect(compactTick(2_000)).toBe("2K");
    });

    it("writes dollars, USDG and percentages", () => {
      expect(fmtUsd(1_016_701.4)).toBe("$1,016,701");
      expect(fmtUsdExact(1250.5)).toBe("$1,250.50");
      expect(fmtUsdg(1250.123456)).toBe("1,250.12");
      expect(fmtPct(6.1)).toBe("6.10%");
      expect(shortAddress("0x16a59f35EF7E61058E729c02C38c3b0406390b12")).toBe("0x16a5…0b12");
    });
  });

  describe("negative", () => {
    it("writes a dash, never a zero, where there is no figure", () => {
      expect(orDash(null, fmtPct)).toBe(NO_FIGURE);
      expect(orDash(undefined, fmtCompactUsdg)).toBe(NO_FIGURE);
      expect(NO_FIGURE).not.toMatch(/\d/);
    });
  });

  describe("edge case", () => {
    it("writes zero as zero: an empty market is a figure", () => {
      expect(orDash(0, fmtPct)).toBe("0.00%");
      expect(orDash(0, fmtCompactUsdg)).toBe("0.00 USDG");
      expect(compactParts(0)).toEqual({ figure: "0.00", unit: "" });
      expect(compactTick(0)).toBe("0");
    });

    it("gives an amount under a thousand no magnitude", () => {
      expect(compactParts(999.994)).toEqual({ figure: "999.99", unit: "" });
      expect(compactParts(1_000)).toEqual({ figure: "1.00", unit: "K" });
      expect(compactTick(500)).toBe("500");
    });
  });
});
