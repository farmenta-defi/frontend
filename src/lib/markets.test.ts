import { isAddress, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import * as fork from "../../scripts/fork.mjs";
import { COLLATERAL_POOLS, findPool, MARKETS, poolById, poolHref, USDG, type CollateralPool } from "./markets";
import { poolIdOf, type PoolKey } from "./onchain/contracts";

/**
 * The six pools listed on the chain, from docs ARCHITECTURE.md §18.1 and
 * FAR-80, written out here a second time so that a slip in `markets.ts` is
 * not checked against itself.
 */
const LISTED = [
  {
    pair: "ETH/USDG",
    tier: "blue-chip",
    slug: "eth-usdg",
    poolId: "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551",
    key: {
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      fee: 8388608,
      tickSpacing: 10,
      hooks: "0x06a889870C8f83640D6816319f72e2aA579b6080",
    },
  },
  {
    pair: "META/USDG",
    tier: "blue-chip",
    slug: "meta-usdg",
    poolId: "0x5875d407a42965b0e768c8925cea290e06fa50603ef34fc99eb92a1050e6ae36",
    key: {
      currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      currency1: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
      fee: 3000,
      tickSpacing: 60,
      hooks: "0x0000000000000000000000000000000000000000",
    },
  },
  {
    pair: "NVDA/USDG",
    tier: "blue-chip",
    slug: "nvda-usdg",
    poolId: "0x6444a8e0b267406a15db74ca00c4a24bdfa81ed3180f5b6d0851f8ed6f4f29c5",
    key: {
      currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      currency1: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
      fee: 100,
      tickSpacing: 1,
      hooks: "0x0000000000000000000000000000000000000000",
    },
  },
  {
    pair: "CASHCAT/USDG",
    tier: "meme",
    slug: "cashcat-usdg",
    poolId: "0xa92a3df27a00a276183ff7265fd8affa11df1fe8bb23ddfaf13f6c879a3f818b",
    key: {
      currency0: "0x020bfC650A365f8BB26819deAAbF3E21291018b4",
      currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      fee: 2690,
      tickSpacing: 54,
      hooks: "0x0000000000000000000000000000000000000000",
    },
  },
  {
    pair: "PONS/USDG",
    tier: "meme",
    slug: "pons-usdg",
    poolId: "0x486435a1f76cd58193f854c6e6213cd05fd58d637865d02065ff558b387fa6ea",
    key: {
      currency0: "0x39dBED3a2bd333467115dE45665cC57F813C4571",
      currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      fee: 8388608,
      tickSpacing: 60,
      hooks: "0x08E52564Bad99E05a694b4809F397edcA417A080",
    },
  },
  {
    pair: "AI/USDG",
    tier: "meme",
    slug: "ai-usdg",
    poolId: "0x7aebd80541bfaaf23dbb6e99ce13d4d31c1a84c91414f971eadbff7db5f85995",
    key: {
      currency0: "0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18",
      currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      fee: 2300,
      tickSpacing: 23,
      hooks: "0x0000000000000000000000000000000000000000",
    },
  },
] as const;

/** Pools the app listed before, none of them listed on the chain. */
const REMOVED = [
  { pair: "ETH/USDG", tier: "blue-chip", slug: "eth-usdg", poolId: "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32" },
  { pair: "WETH/USDG", tier: "blue-chip", slug: "weth-usdg", poolId: "0x84bd4e2d8be11aeb0afc1195b38f587b61e90068548f1063fdbe448fb8cad0b6" },
  { pair: "cbBTC/USDG", tier: "blue-chip", slug: "cbbtc-usdg", poolId: "0x2ad6f81c05b3e7490fa61d84c93b072e5f8ac41d60e93b27a4c8150fd3e6b719" },
  { pair: "NVDA/USDG", tier: "blue-chip", slug: "nvda-usdg", poolId: "0x8e40b7d29fa1c6350b82e5947dc016af3b95206ec7418d3fa0629bd5417ce082" },
  { pair: "PONS/USDG", tier: "meme", slug: "pons-usdg", poolId: "0xc7e1a4938b025f6d3ca9017e4b82df5610a3c94e7f2b8d05619ae37c2d840bf1" },
  { pair: "PENGU/USDG", tier: "meme", slug: "pengu-usdg", poolId: "0x5b31e7a04c986d2fb8570ae3149cd026f7b8a41e93052dc6187fa3b40c9e2751" },
  { pair: "AI/USDG", tier: "meme", slug: "ai-usdg", poolId: "0xa14c930e6bd25f871034ae9c2f60b3d8517e0946cb28d4f7350a1eb63c82d947" },
  { pair: "MEME/USDG", tier: "meme", slug: "meme-usdg", poolId: "0xd06b2f9143ae785c02b64d1930fa8e57c41b06d2937fe58a10c4b73e6a92d015" },
] as const;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

describe("the listed pools", () => {
  describe("positive", () => {
    it("are exactly the six listed on the chain, under the names they go by", () => {
      expect(COLLATERAL_POOLS.map((pool) => pool.pair)).toEqual(LISTED.map((pool) => pool.pair));
      expect(COLLATERAL_POOLS.map((pool) => pool.poolId)).toEqual(LISTED.map((pool) => pool.poolId));
      expect(COLLATERAL_POOLS.every((pool) => pool.network === "robinhood")).toBe(true);
    });

    it("each carry the PoolKey its id is the hash of", () => {
      for (const listed of LISTED) {
        expect(poolIdOf(listed.key as PoolKey), listed.pair).toBe(listed.poolId);
        const pool = poolById(listed.poolId)!;
        expect(pool.key, listed.pair).toEqual(listed.key);
        expect(poolIdOf(pool.key), listed.pair).toBe(pool.poolId);
      }
    });

    it("are found under their own network, market, id and pair", () => {
      for (const listed of LISTED) {
        const pool = findPool("robinhood", listed.tier, listed.poolId, listed.slug);
        expect(pool?.pair, listed.pair).toBe(listed.pair);
        expect(poolHref(pool!)).toBe(`/robinhood/${listed.tier}/${listed.poolId}/${listed.slug}`);
      }
    });

    it("are three to a market, priced by Chainlink in blue chip and by the TWAP in meme", () => {
      const of = (tier: string) => COLLATERAL_POOLS.filter((pool) => pool.tier === tier);

      expect(of("blue-chip").map((pool) => pool.base.symbol)).toEqual(["ETH", "META", "NVDA"]);
      expect(of("meme").map((pool) => pool.base.symbol)).toEqual(["CASHCAT", "PONS", "AI"]);
      expect(of("blue-chip").every((pool) => pool.trustedBy === "Chainlink")).toBe(true);
      expect(of("meme").every((pool) => pool.trustedBy === "30m TWAP")).toBe(true);
    });

    it("are the tokens each market names as its collateral", () => {
      for (const market of MARKETS) {
        const symbols = COLLATERAL_POOLS.filter((pool) => pool.tier === market.id).map((pool) => pool.base.symbol);
        expect(market.collateral, market.name).toBe(
          `${symbols.join(" · ")}, against USDG${market.id === "meme" ? " (allowlisted)" : ""}`,
        );
      }
    });
  });

  describe("negative", () => {
    it("are not found under the other market", () => {
      for (const listed of LISTED) {
        const other = listed.tier === "blue-chip" ? "meme" : "blue-chip";
        expect(findPool("robinhood", other, listed.poolId, listed.slug), listed.pair).toBeNull();
      }
    });

    it("are not found under another pool's pair, or on another network", () => {
      for (const listed of LISTED) {
        for (const other of LISTED.filter((pool) => pool.slug !== listed.slug)) {
          expect(findPool("robinhood", listed.tier, listed.poolId, other.slug), `${listed.pair} as ${other.slug}`).toBeNull();
        }
        expect(findPool("arbitrum", listed.tier, listed.poolId, listed.slug), listed.pair).toBeNull();
      }
    });

    it("do not include the old ETH/USDG pool, the placeholders, or the ids that were made up", () => {
      for (const removed of REMOVED) {
        expect(poolById(removed.poolId), removed.pair).toBeNull();
        expect(findPool("robinhood", removed.tier, removed.poolId, removed.slug), removed.pair).toBeNull();
      }
      for (const gone of ["WETH", "cbBTC", "PENGU", "MEME"]) {
        expect(COLLATERAL_POOLS.some((pool) => pool.pair.startsWith(`${gone}/`)), gone).toBe(false);
        expect(MARKETS.some((market) => market.collateral.includes(gone)), gone).toBe(false);
      }
    });
  });

  describe("edge case", () => {
    it("show one ETH/USDG in blue chip, the listed one", () => {
      const eth = COLLATERAL_POOLS.filter((pool) => pool.tier === "blue-chip" && pool.pair === "ETH/USDG");

      expect(eth.map((pool) => pool.poolId)).toEqual([LISTED[0].poolId]);
      expect(eth[0].slug).toBe("eth-usdg");
    });

    it("are found whatever the case of the id in the URL", () => {
      for (const listed of LISTED) {
        const upper = listed.poolId.toUpperCase().replace("0X", "0x");
        expect(findPool("robinhood", listed.tier, upper, listed.slug)?.pair, listed.pair).toBe(listed.pair);
      }
    });

    it("name USDG second whichever side of the pool it is on", () => {
      const usdgFirst = COLLATERAL_POOLS.filter((pool) => same(pool.key.currency0, USDG)).map((pool) => pool.pair);

      expect(usdgFirst).toEqual(["META/USDG", "NVDA/USDG"]);
      for (const pool of COLLATERAL_POOLS) {
        expect(pool.pair, pool.pair).toBe(`${pool.base.symbol}/USDG`);
        expect([pool.key.currency0, pool.key.currency1].filter((currency) => same(currency, USDG))).toHaveLength(1);
        expect(isAddress(pool.key.currency0) && isAddress(pool.key.currency1) && isAddress(pool.key.hooks)).toBe(true);
      }
    });

    it("pair native ETH, not WETH, in ETH/USDG, and carry a hook and a dynamic fee where the pool has them", () => {
      const byPair = (pair: string) => COLLATERAL_POOLS.find((pool) => pool.pair === pair) as CollateralPool;

      expect(byPair("ETH/USDG").key.currency0).toBe(zeroAddress);
      for (const pair of ["ETH/USDG", "PONS/USDG"]) {
        expect(byPair(pair).key.fee, pair).toBe(0x800000);
        expect(byPair(pair).key.hooks, pair).not.toBe(zeroAddress);
      }
      for (const pair of ["META/USDG", "NVDA/USDG", "CASHCAT/USDG", "AI/USDG"]) {
        expect(byPair(pair).key.hooks, pair).toBe(zeroAddress);
      }
    });

    it("follow the stock market's hours for the two stocks only", () => {
      const stocks = COLLATERAL_POOLS.filter((pool) => pool.feedHours === "us-stock-market").map((pool) => pool.pair);

      expect(stocks).toEqual(["META/USDG", "NVDA/USDG"]);
    });
  });
});

describe("the fork", () => {
  describe("positive", () => {
    it("lists only pools the app has a page for, under the same PoolKey", () => {
      expect(fork.LISTED_POOLS.map((pool: { id: string }) => pool.id)).toEqual(COLLATERAL_POOLS.map((pool) => pool.poolId));
      for (const listed of fork.LISTED_POOLS) {
        const pool = poolById(listed.id as `0x${string}`);
        expect(pool, listed.id).not.toBeNull();
        expect(pool!.key, listed.id).toEqual(listed.key);
      }
    });
  });

  describe("negative", () => {
    it("lists none of the pools that were removed", () => {
      for (const removed of REMOVED) {
        expect(fork.LISTED_POOLS.some((pool: { id: string }) => same(pool.id, removed.poolId)), removed.pair).toBe(false);
      }
    });
  });

  describe("edge case", () => {
    it("has every pool's id as the hash of the key it lists it under", () => {
      for (const listed of fork.LISTED_POOLS) {
        expect(poolIdOf(listed.key as PoolKey), listed.id).toBe(listed.id);
      }
    });
  });
});
