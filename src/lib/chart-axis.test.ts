import { describe, expect, it } from "vitest";

import { valueAxis } from "./chart-axis";

describe("valueAxis", () => {
  describe("positive", () => {
    it("tops out just above the peak, on a round step", () => {
      expect(valueAxis(1_240_000)).toEqual({ top: 1_500_000, ticks: [500_000, 1_000_000, 1_500_000] });
      expect(valueAxis(6.1)).toEqual({ top: 8, ticks: [2, 4, 6, 8] });
    });

    it("leaves room above the peak", () => {
      for (const peak of [0.04, 3, 99, 1_000, 25_000, 312_400]) {
        const { top, ticks } = valueAxis(peak);
        expect(top, String(peak)).toBeGreaterThanOrEqual(peak * 1.04);
        expect(ticks[ticks.length - 1], String(peak)).toBe(top);
      }
    });
  });

  describe("negative", () => {
    it("has an axis for what is not a positive number, instead of NaN", () => {
      for (const peak of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, -5]) {
        expect(valueAxis(peak), String(peak)).toEqual({ top: 1, ticks: [] });
      }
    });
  });

  describe("edge case", () => {
    it("has an axis for a series that is zero throughout, as an empty market's is", () => {
      const { top, ticks } = valueAxis(0);

      expect(top).toBe(1);
      expect(ticks).toEqual([]);
      // What the chart divides by.
      expect(Number.isFinite(0 / top)).toBe(true);
    });

    it("has an axis for a rate of a hundredth of a percent", () => {
      const { top, ticks } = valueAxis(0.01);

      expect(top).toBeGreaterThan(0.01);
      expect(ticks.every((tick) => tick > 0 && tick <= top)).toBe(true);
    });
  });
});
