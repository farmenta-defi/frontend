import { describe, expect, it } from "vitest";

import { directoryRows, inRanges, NO_RANGES, type DirectoryRow } from "./directory";
import { listedPoolOf, poolOf } from "./figures";
import poolEthUsdg from "./fixtures/pool-eth-usdg.json";
import poolMetaUsdg from "./fixtures/pool-meta-usdg.json";
import poolPonsUsdg from "./fixtures/pool-pons-usdg.json";
import poolsBlueChip from "./fixtures/pools-blue-chip.json";
import poolsMeme from "./fixtures/pools-meme.json";
import { readListedPools, readPool } from "./wire";

const pools = [
  { poolId: "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551", pair: "ETH/USDG" },
  { poolId: "0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36", pair: "META/USDG" },
  { poolId: "0x6444a8e0b267406a15db74ca00c4a24bdfa81ed3180f5b6d0851f8ed6f4f29c5", pair: "NVDA/USDG" },
  { poolId: "0x486435a1f76cd58193f854c6e6213cd05fd58d637865d02065ff558b387fa6ea", pair: "PONS/USDG" },
] as const;

const listed = [...readListedPools(poolsBlueChip)!, ...readListedPools(poolsMeme)!].map((pool) => listedPoolOf(pool)!);
const figures = [poolEthUsdg, poolMetaUsdg, poolPonsUsdg].map((pool) => poolOf(readPool(pool)!)!);

const row = (change: Partial<DirectoryRow<unknown>>): DirectoryRow<unknown> => ({
  pool: pools[0],
  maxLtvPct: 65,
  debtUsdg: 312_400,
  availableToBorrowUsdg: 4_200,
  borrowAprPct: 6.1,
  rate6hPct: 5.95,
  frozen: false,
  ...change,
});

describe("directoryRows", () => {
  describe("positive", () => {
    it("gives each pool the figures the backend recorded for it", () => {
      const rows = directoryRows(pools, listed, figures);

      expect(rows.map((item) => item.pool.pair)).toEqual(["ETH/USDG", "META/USDG", "NVDA/USDG", "PONS/USDG"]);
      expect(rows.map((item) => item.maxLtvPct)).toEqual([65, 50, 50, 30]);
      expect(rows[0]).toMatchObject({ debtUsdg: 0, availableToBorrowUsdg: 0, borrowAprPct: 0, rate6hPct: 0, frozen: false });
    });

    it("shows a pool in use with its own debt and rate", () => {
      const inUse = { ...figures[0], debtUsdg: 312_400, availableToBorrowUsdg: 4_200.5, borrowAprPct: 6.1, rate6hPct: 5.95 };

      const [eth, meta] = directoryRows(pools, listed, [inUse, figures[1]]);

      expect(eth).toMatchObject({ debtUsdg: 312_400, availableToBorrowUsdg: 4_200.5, borrowAprPct: 6.1, rate6hPct: 5.95 });
      expect(meta.debtUsdg).toBe(0);
    });
  });

  describe("negative", () => {
    it("keeps every row and has no figure in it when the backend answered nothing", () => {
      const rows = directoryRows(pools, [], []);

      expect(rows).toHaveLength(4);
      for (const item of rows) {
        expect(item).toMatchObject({
          maxLtvPct: null,
          debtUsdg: null,
          availableToBorrowUsdg: null,
          borrowAprPct: null,
          rate6hPct: null,
          frozen: null,
        });
      }
    });

    it("has no row for a pool the backend lists and the app has no page for", () => {
      const rows = directoryRows(pools.slice(0, 2), listed, figures);

      expect(rows.map((item) => item.pool.pair)).toEqual(["ETH/USDG", "META/USDG"]);
    });
  });

  describe("edge case", () => {
    it("has the terms from the list, and no amounts, for a pool whose own answer did not come", () => {
      const nvda = directoryRows(pools, listed, figures)[2];

      expect(nvda).toMatchObject({ maxLtvPct: 50, frozen: false, debtUsdg: null, borrowAprPct: null });
    });

    it("has the amounts from the pool's own answer when the list did not come", () => {
      const [eth] = directoryRows(pools, [], figures);

      expect(eth).toMatchObject({ maxLtvPct: 65, debtUsdg: 0, frozen: false });
    });

    it("shows a frozen pool as frozen", () => {
      const frozen = { ...figures[0], terms: { ...figures[0].terms, frozen: true } };

      expect(directoryRows(pools, listed, [frozen])[0].frozen).toBe(true);
    });
  });
});

describe("inRanges", () => {
  describe("positive", () => {
    it("lets every row through when no bound is set, a row without figures included", () => {
      expect(inRanges(row({}), NO_RANGES)).toBe(true);
      expect(inRanges(row({ maxLtvPct: null, debtUsdg: null, availableToBorrowUsdg: null, rate6hPct: null }), NO_RANGES)).toBe(true);
    });

    it("lets a row through that is inside every bound", () => {
      const ranges = { ...NO_RANGES, borrowMin: "100000", borrowMax: "400000", rateMin: "5", lltvMin: 50, lltvMax: 70 };

      expect(inRanges(row({}), ranges)).toBe(true);
    });
  });

  describe("negative", () => {
    it("holds back a row outside a bound", () => {
      expect(inRanges(row({}), { ...NO_RANGES, borrowMin: "400000" })).toBe(false);
      expect(inRanges(row({}), { ...NO_RANGES, availableMax: "1000" })).toBe(false);
      expect(inRanges(row({}), { ...NO_RANGES, rateMax: "5" })).toBe(false);
      expect(inRanges(row({}), { ...NO_RANGES, lltvMax: 60 })).toBe(false);
    });

    it("holds back a row without the figure a bound is set on", () => {
      expect(inRanges(row({ debtUsdg: null }), { ...NO_RANGES, borrowMin: "0" })).toBe(false);
      expect(inRanges(row({ maxLtvPct: null }), { ...NO_RANGES, lltvMin: 30 })).toBe(false);
    });
  });

  describe("edge case", () => {
    it("counts a figure on the bound as inside it", () => {
      expect(inRanges(row({}), { ...NO_RANGES, borrowMin: "312400", borrowMax: "312400", lltvMin: 65, lltvMax: 65 })).toBe(true);
    });

    it("lets an empty pool through a minimum of zero", () => {
      expect(inRanges(row({ debtUsdg: 0 }), { ...NO_RANGES, borrowMin: "0" })).toBe(true);
    });

    it("ignores a bound that is not a number", () => {
      expect(inRanges(row({}), { ...NO_RANGES, borrowMin: "abc" })).toBe(true);
    });
  });
});
