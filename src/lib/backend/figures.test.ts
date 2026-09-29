import { describe, expect, it, vi } from "vitest";

import { knownPools, listedPoolOf, marketOf, poolOf, readingOf, tierOf } from "./figures";
import markets from "./fixtures/markets.json";
import poolEthUsdg from "./fixtures/pool-eth-usdg.json";
import poolMetaUsdg from "./fixtures/pool-meta-usdg.json";
import poolPonsUsdg from "./fixtures/pool-pons-usdg.json";
import poolsBlueChip from "./fixtures/pools-blue-chip.json";
import poolsMeme from "./fixtures/pools-meme.json";
import { readListedPools, readMarkets, readPool, type WireSnapshot } from "./wire";

const ETH_USDG = "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551";
const META_USDG = "0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36";
const NVDA_USDG = "0x6444a8e0b267406a15db74ca00c4a24bdfa81ed3180f5b6d0851f8ed6f4f29c5";
const CASHCAT_USDG = "0xa92a3df27a00a276183ff7265fd8affa11df1fe8bb23ddfaf13f6c879a3f818b";
const PONS_USDG = "0x486435a1f76cd58193f854c6e6213cd05fd58d637865d02065ff558b387fa6ea";
const AI_USDG = "0x7aebd80541bfaaf23dbb6e99ce13d4d31c1a84c91414f971eadbff7db5f85995";

/** One reading of the recorded history, with the amounts of a market in use. */
const inUse = (change: Partial<WireSnapshot>): WireSnapshot => ({ ...readMarkets(markets)![0].history[0], ...change });

describe("the markets", () => {
  describe("positive", () => {
    it("reads both markets of the recorded answer under the app's own tier names", () => {
      const figures = readMarkets(markets)!.map(marketOf);

      expect(figures.map((market) => market?.tier)).toEqual(["blue-chip", "meme"]);
      for (const market of figures) {
        expect(market!.history).toHaveLength(29);
        expect(market!.latest).not.toBeNull();
      }
    });

    it("turns a reading into USDG and percentages", () => {
      const reading = readingOf(
        inUse({
          totalAssets: "1240000000000",
          totalBorrows: "768800000000",
          reserves: "1500000000",
          utilizationBps: 6192,
          borrowAprBps: 610,
          supplyApyBps: 321,
        }),
      );

      expect(reading).toMatchObject({
        suppliedUsdg: 1_240_000,
        borrowedUsdg: 768_800,
        // Cash is what lenders own, plus the reserves, less what is lent out.
        liquidityUsdg: 472_700,
        utilizationPct: 61.92,
        borrowAprPct: 6.1,
        supplyApyPct: 3.21,
      });
    });

    it("keeps the history oldest first and half an hour apart, as recorded", () => {
      const { history } = marketOf(readMarkets(markets)![0])!;

      expect(new Date(history[0].at).toISOString()).toBe("2026-09-28T16:00:00.000Z");
      expect(new Date(history[28].at).toISOString()).toBe("2026-09-29T06:00:00.000Z");
      for (let i = 1; i < history.length; i++) expect(history[i].at - history[i - 1].at).toBe(30 * 60 * 1000);
    });
  });

  describe("negative", () => {
    it("has no market for a tier the app does not know", () => {
      expect(marketOf({ ...readMarkets(markets)![0], tier: "stable" })).toBeNull();
      expect(tierOf("stable")).toBeNull();
      expect(tierOf(3)).toBeNull();
      expect(tierOf(undefined)).toBeNull();
    });

    it("does not read an answer that is not the markets", () => {
      expect(readMarkets(poolsBlueChip)).toBeNull();
      expect(readMarkets({ markets })).toBeNull();
      expect(readMarkets(null)).toBeNull();
      expect(readMarkets([{ ...markets[0], history: "none" }])).toBeNull();
    });

    it("drops a reading without a time instead of drawing it at 1970", () => {
      expect(readingOf(inUse({ observedAt: "soon" }))).toBeNull();
      const market = marketOf({ ...readMarkets(markets)![0], history: [inUse({ observedAt: "soon" }), inUse({})] })!;
      expect(market.history).toHaveLength(1);
    });
  });

  describe("edge case", () => {
    it("shows the recorded market, which nobody has supplied to, as zero and not as missing", () => {
      const { latest } = marketOf(readMarkets(markets)![0])!;

      expect(latest).toMatchObject({
        suppliedUsdg: 0,
        borrowedUsdg: 0,
        liquidityUsdg: 0,
        utilizationPct: 0,
        borrowAprPct: 0,
        supplyApyPct: 0,
      });
    });

    it("has no latest reading for a market the backend has not read yet, and still has the market", () => {
      const market = marketOf({ ...readMarkets(markets)![0], snapshot: null, history: [] });

      expect(market).toEqual({ tier: "blue-chip", latest: null, history: [] });
    });

    it("has no amount for a field that is not one, and keeps the rest of the reading", () => {
      const reading = readingOf(inUse({ totalBorrows: "12.5", utilizationBps: 6192 }))!;

      expect(reading.borrowedUsdg).toBeNull();
      expect(reading.liquidityUsdg).toBeNull();
      expect(reading.suppliedUsdg).toBe(0);
      expect(reading.utilizationPct).toBe(61.92);
    });

    it("never reports less than no idle cash", () => {
      const reading = readingOf(inUse({ totalAssets: "100", totalBorrows: "150", reserves: "0" }))!;

      expect(reading.liquidityUsdg).toBe(0);
    });
  });
});

describe("the pools of a market", () => {
  const blueChip = readListedPools(poolsBlueChip)!.map(listedPoolOf);
  const meme = readListedPools(poolsMeme)!.map(listedPoolOf);
  const termsOf = (poolId: string) => [...blueChip, ...meme].find((pool) => pool?.poolId === poolId)?.terms;

  describe("positive", () => {
    it("lists the three pools of each market", () => {
      expect(blueChip.map((pool) => pool?.poolId).sort()).toEqual([META_USDG, NVDA_USDG, ETH_USDG].sort());
      expect(meme.map((pool) => pool?.poolId).sort()).toEqual([PONS_USDG, AI_USDG, CASHCAT_USDG].sort());
      expect(blueChip.every((pool) => pool?.tier === "blue-chip")).toBe(true);
      expect(meme.every((pool) => pool?.tier === "meme")).toBe(true);
    });

    it("reads each pool's own terms, which are not its market's preset", () => {
      // ETH/USDG is on the blue-chip preset; the two stock pools are tighter.
      expect(termsOf(ETH_USDG)).toMatchObject({ maxLtvPct: 65, liquidationThresholdPct: 75, liquidatorBonusPct: 5 });
      for (const stock of [META_USDG, NVDA_USDG]) {
        expect(termsOf(stock)).toMatchObject({ maxLtvPct: 50, liquidationThresholdPct: 65, liquidatorBonusPct: 5 });
      }
      for (const pool of [CASHCAT_USDG, PONS_USDG, AI_USDG]) {
        expect(termsOf(pool)).toMatchObject({ maxLtvPct: 30, liquidationThresholdPct: 40, liquidatorBonusPct: 10 });
      }
    });

    it("reads the cap in USDG and the minimum position in dollars", () => {
      for (const pool of [ETH_USDG, META_USDG, NVDA_USDG]) expect(termsOf(pool)?.debtCapUsdg).toBe(25_000);
      for (const pool of [CASHCAT_USDG, PONS_USDG, AI_USDG]) expect(termsOf(pool)?.debtCapUsdg).toBe(3_000);
      for (const pool of [...blueChip, ...meme]) expect(pool?.terms.minPositionUsd).toBe(50);
    });
  });

  describe("negative", () => {
    it("does not read a list whose pool has no id, or an id that is not one", () => {
      const [first] = readListedPools(poolsBlueChip)!;

      expect(readListedPools([{ ...first, id: undefined }])).toBeNull();
      expect(readListedPools([{ ...first, id: "0xbac3" }])).toBeNull();
      expect(readListedPools(poolEthUsdg)).toBeNull();
    });

    it("has no pool for a tier the app does not know", () => {
      expect(listedPoolOf({ ...readListedPools(poolsBlueChip)![0], tier: 3 })).toBeNull();
    });
  });

  describe("edge case", () => {
    it("reads a pool whose PoolKey the backend does not have yet, as all six are recorded", () => {
      for (const pool of [...readListedPools(poolsBlueChip)!, ...readListedPools(poolsMeme)!]) {
        expect(pool).toMatchObject({ currency0: null, currency1: null, fee: null, tickSpacing: null, hooks: null });
        expect(listedPoolOf(pool)).not.toBeNull();
      }
    });

    it("shows the threshold in force, which a delisting ramp lowers under the listed one", () => {
      const [first] = readListedPools(poolsBlueChip)!;

      expect(listedPoolOf({ ...first, ltBps: 6500, effectiveLtBps: 5900 })?.terms.liquidationThresholdPct).toBe(59);
    });

    it("derives the protocol's liquidation fee as a tenth of the bonus", () => {
      expect(termsOf(ETH_USDG)?.protocolLiquidationFeePct).toBe(0.5);
      expect(termsOf(PONS_USDG)?.protocolLiquidationFeePct).toBe(1);
    });
  });
});

describe("one pool", () => {
  describe("positive", () => {
    it("reads the figures of the recorded pools", () => {
      expect(poolOf(readPool(poolEthUsdg)!)).toMatchObject({
        poolId: ETH_USDG,
        tier: "blue-chip",
        terms: { maxLtvPct: 65, liquidationThresholdPct: 75, debtCapUsdg: 25_000, minPositionUsd: 50, frozen: false },
      });
      expect(poolOf(readPool(poolMetaUsdg)!)).toMatchObject({
        poolId: META_USDG,
        tier: "blue-chip",
        terms: { maxLtvPct: 50, liquidationThresholdPct: 65, debtCapUsdg: 25_000 },
      });
      expect(poolOf(readPool(poolPonsUsdg)!)).toMatchObject({
        poolId: PONS_USDG,
        tier: "meme",
        terms: { maxLtvPct: 30, liquidationThresholdPct: 40, liquidatorBonusPct: 10, debtCapUsdg: 3_000 },
      });
    });

    it("turns a pool in use into USDG and percentages", () => {
      const pool = poolOf({
        ...readPool(poolEthUsdg)!,
        poolDebtUsdg: "312400000000",
        availableToBorrowUsdg: "4200500000",
        borrowAprPct: "6.10",
        rate6hPct: "5.95",
      });

      expect(pool).toMatchObject({ debtUsdg: 312_400, availableToBorrowUsdg: 4_200.5, borrowAprPct: 6.1, rate6hPct: 5.95 });
    });

    it("carries the history of the pool's market", () => {
      const pool = poolOf(readPool(poolPonsUsdg)!)!;
      const meme = marketOf(readMarkets(markets)![1])!;

      // Recorded a moment apart, so the pool's history is the market's, one reading or none behind.
      expect(pool.history.length).toBeGreaterThanOrEqual(meme.history.length - 1);
      expect(pool.history[0].at).toBe(meme.history[0].at);
    });
  });

  describe("negative", () => {
    it("does not read an answer that is not a pool", () => {
      expect(readPool(markets)).toBeNull();
      expect(readPool(poolsBlueChip)).toBeNull();
      expect(readPool({ ...poolEthUsdg, history: undefined })).toBeNull();
      expect(readPool({ ...poolEthUsdg, poolDebtUsdg: 0 })).toBeNull();
    });
  });

  describe("edge case", () => {
    it("shows the recorded pool, which nobody has borrowed from, as zero and not as missing", () => {
      expect(poolOf(readPool(poolEthUsdg)!)).toMatchObject({
        debtUsdg: 0,
        availableToBorrowUsdg: 0,
        borrowAprPct: 0,
        rate6hPct: 0,
      });
    });

    it("has no rate while the backend has none, which is not a rate of zero", () => {
      const pool = poolOf({ ...readPool(poolEthUsdg)!, borrowAprPct: null, rate6hPct: null })!;

      expect(pool.borrowAprPct).toBeNull();
      expect(pool.rate6hPct).toBeNull();
      expect(pool.debtUsdg).toBe(0);
    });

    it("reads the pool id whatever its case", () => {
      const pool = poolOf({ ...readPool(poolEthUsdg)!, id: ETH_USDG.toUpperCase().replace("0X", "0x") })!;

      expect(pool.poolId).toBe(ETH_USDG);
    });
  });
});

describe("knownPools", () => {
  const known = [{ poolId: ETH_USDG, pair: "ETH/USDG" }, { poolId: META_USDG, pair: "META/USDG" }] as const;
  const listed = readListedPools(poolsBlueChip)!.map((pool) => listedPoolOf(pool)!);

  describe("positive", () => {
    it("pairs each pool the app knows with what the backend lists for it, in the app's order", () => {
      const report = vi.fn();

      const pools = knownPools(listed, known, report);

      expect(pools.map(({ pool }) => pool.pair)).toEqual(["ETH/USDG", "META/USDG"]);
      expect(pools[1].listed.terms.maxLtvPct).toBe(50);
    });
  });

  describe("negative", () => {
    it("leaves out a pool the backend lists and the app has no page for, and reports it", () => {
      const report = vi.fn();

      const pools = knownPools(listed, known, report);

      expect(pools.some(({ listed: pool }) => pool.poolId === NVDA_USDG)).toBe(false);
      expect(report).toHaveBeenCalledTimes(1);
      expect(report.mock.calls[0][0]).toContain(NVDA_USDG);
    });
  });

  describe("edge case", () => {
    it("leaves out a pool the app knows and the backend does not list, without reporting it", () => {
      const report = vi.fn();

      const pools = knownPools(listed, [...known, { poolId: PONS_USDG, pair: "PONS/USDG" }], report);

      expect(pools.map(({ pool }) => pool.pair)).toEqual(["ETH/USDG", "META/USDG"]);
      expect(report).toHaveBeenCalledTimes(1);
    });

    it("matches a pool id whatever its case", () => {
      const pools = knownPools(listed, [{ poolId: ETH_USDG.toUpperCase().replace("0X", "0x") as `0x${string}` }], vi.fn());

      expect(pools).toHaveLength(1);
    });

    it("reports nothing and lists nothing for an empty answer", () => {
      const report = vi.fn();

      expect(knownPools([], known, report)).toEqual([]);
      expect(report).not.toHaveBeenCalled();
    });
  });
});
