import { describe, expect, it } from "vitest";

import {
  compactParts,
  compactTick,
  fmtAmount,
  fmtCompactUsdg,
  fmtPct,
  fmtTimestampUtc,
  fmtUsd,
  fmtUsdExact,
  fmtUsdg,
  fmtUsdgFull,
  NO_FIGURE,
  orDash,
  shortAddress,
  shortHash,
} from "./format";

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

    it("writes a row of a history: the amount to its last decimal, the instant in UTC, the hash shortened", () => {
      expect(fmtUsdgFull(0.100613)).toBe("0.100613");
      expect(fmtUsdgFull(1250.5)).toBe("1,250.5");
      expect(fmtUsdgFull(30)).toBe("30");
      expect(fmtTimestampUtc(1_790_745_159_000)).toBe("2026-09-30 05:12:39");
      expect(shortHash("0x4552664816ea9d118349dc69c23c8fa0fbd2496b900ea654905a4c45290b7eb0")).toBe("0x45526648…7eb0");
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

    it("writes a token amount with the digits its size calls for", () => {
      expect(fmtAmount(604_610.492)).toBe("604,610");
      expect(fmtAmount(1.372749240445278)).toBe("1.3727");
      expect(fmtAmount(0.243723219459019)).toBe("0.2437");
      expect(fmtAmount(0.00001234567)).toBe("0.00001235");
      expect(fmtAmount(0)).toBe("0");
    });

    it("does not round a small amount of a history away, where the table of figures would", () => {
      expect(fmtUsdg(0.000001)).toBe("0");
      expect(fmtUsdgFull(0.000001)).toBe("0.000001");
      expect(fmtUsdgFull(0)).toBe("0");
    });

    it("writes an instant with every part padded, at the start of a year", () => {
      expect(fmtTimestampUtc(Date.UTC(2027, 0, 1, 0, 0, 0))).toBe("2027-01-01 00:00:00");
      expect(fmtTimestampUtc(Date.UTC(2026, 8, 7, 3, 4, 5))).toBe("2026-09-07 03:04:05");
    });

    it("gives an amount under a thousand no magnitude", () => {
      expect(compactParts(999.994)).toEqual({ figure: "999.99", unit: "" });
      expect(compactParts(1_000)).toEqual({ figure: "1.00", unit: "K" });
      expect(compactTick(500)).toBe("500");
    });
  });
});
