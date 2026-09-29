import { describe, expect, it } from "vitest";

import { marketOf, type MarketReading } from "./figures";
import markets from "./fixtures/markets.json";
import { averageOver, balanceSeries, rateSeries, rateSummary } from "./series";
import { readMarkets } from "./wire";

const HOUR = 3_600_000;
const recorded = marketOf(readMarkets(markets)![0])!.history;

/** Readings an hour apart, the latest last, with the borrow rate given for each. */
const hourly = (rates: (number | null)[]): MarketReading[] =>
  rates.map((borrowAprPct, i) => ({
    at: Date.UTC(2026, 8, 29) + i * HOUR,
    suppliedUsdg: 1_000 + i,
    borrowedUsdg: 400 + i,
    liquidityUsdg: 600,
    utilizationPct: 40,
    borrowAprPct,
    supplyApyPct: borrowAprPct === null ? null : borrowAprPct / 2,
  }));

describe("the series of a history", () => {
  describe("positive", () => {
    it("draws each balance of the recorded history, one point per reading", () => {
      for (const metric of ["borrow", "supply", "liquidity"] as const) {
        const series = balanceSeries(recorded, metric);
        expect(series).toHaveLength(29);
        expect(series.map((point) => point.t)).toEqual(recorded.map((reading) => reading.at));
      }
    });

    it("draws the amounts and the rates of a market in use", () => {
      const history = hourly([6, 6.5, 7]);

      expect(balanceSeries(history, "supply").map((point) => point.v)).toEqual([1_000, 1_001, 1_002]);
      expect(balanceSeries(history, "borrow").map((point) => point.v)).toEqual([400, 401, 402]);
      expect(rateSeries(history, "borrow").map((point) => point.v)).toEqual([6, 6.5, 7]);
      expect(rateSeries(history, "supply").map((point) => point.v)).toEqual([3, 3.25, 3.5]);
    });

    it("averages over the last six hours, the last day and the last week", () => {
      // Eight days of hourly readings: 1% for the first seven days, 5% on the last.
      const series = rateSeries(hourly([...Array(168).fill(1), ...Array(24).fill(5)]), "borrow");

      expect(rateSummary(series)).toEqual({
        averagePct: (168 * 1 + 24 * 5) / 192,
        average6hPct: 5,
        average24hPct: 5,
        average7dPct: (144 * 1 + 24 * 5) / 168,
      });
    });
  });

  describe("negative", () => {
    it("leaves out a reading without the figure instead of drawing it at zero", () => {
      const series = rateSeries(hourly([6, null, 7]), "borrow");

      expect(series.map((point) => point.v)).toEqual([6, 7]);
      expect(rateSummary(series).averagePct).toBe(6.5);
    });

    it("has no average for a history with no reading in it", () => {
      expect(balanceSeries([], "supply")).toEqual([]);
      expect(averageOver([], 6)).toBeNull();
      expect(rateSummary([])).toEqual({
        averagePct: null,
        average6hPct: null,
        average24hPct: null,
        average7dPct: null,
      });
    });
  });

  describe("edge case", () => {
    it("draws the recorded history, which is zero throughout, as zeros", () => {
      expect(balanceSeries(recorded, "supply").every((point) => point.v === 0)).toBe(true);
      expect(rateSummary(rateSeries(recorded, "borrow"))).toEqual({
        averagePct: 0,
        average6hPct: 0,
        average24hPct: 0,
        average7dPct: 0,
      });
    });

    it("averages what there is when the history is shorter than the window", () => {
      const series = rateSeries(hourly([4, 6]), "borrow");

      expect(averageOver(series, 24 * 7)).toBe(5);
    });

    it("counts the window back from the latest reading, leaving out the one exactly at its far edge", () => {
      const series = rateSeries(hourly([1, 2, 3, 4, 5, 6, 7]), "borrow");

      // Six hours back from the seventh reading is the first one, which is a full window away.
      expect(averageOver(series, 6)).toBe((2 + 3 + 4 + 5 + 6 + 7) / 6);
    });
  });
});
