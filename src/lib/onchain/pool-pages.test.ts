import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";

import { COLLATERAL_POOLS, USDG } from "@/lib/markets";

import { poolIdOf } from "./contracts";
import { inPool, type Discovered } from "./discovery";
import { borrowGate, depositCollateralGate } from "./gates";
import type { PositionState } from "./reads";

/**
 * Which page a position belongs on, for every listed pool: the page of the
 * pool its `PoolKey` hashes to, and none of the other five.
 *
 * The positions are written by hand from the pools' keys. The same is run
 * over positions read from the chain in test/fork/pools.test.ts.
 */
const WAD = 10n ** 18n;

/** A position of `pool` as PositionManager reports it: by its key. The id is derived, not copied. */
const found = (pool: (typeof COLLATERAL_POOLS)[number], tokenId: bigint): Discovered => ({
  tokenId,
  place: "wallet",
  tier: null,
  poolKey: pool.key,
  poolId: poolIdOf(pool.key),
  tickLower: -600,
  tickUpper: 600,
  liquidity: 1_000n,
});

const inWallet = (pool: (typeof COLLATERAL_POOLS)[number], over: Partial<PositionState> = {}): PositionState => ({
  tokenId: 1n,
  place: "wallet",
  poolId: poolIdOf(pool.key),
  poolKey: pool.key,
  ticks: { tickLower: -600, tickUpper: 600 },
  decimals: pool.key.currency0.toLowerCase() === USDG.toLowerCase() ? [6, 18] : [18, 6],
  holdings: { liquidity: 1_000n, amount0: 1n, amount1: 1n, fees0: 0n, fees1: 0n, principalUsd: 1_000n * WAD, feesUsd: 0n },
  holdingsError: null,
  pool: { status: "open", terms: { maxLtvBps: 6500, ltBps: 7500 } },
  paused: false,
  debt: 0n,
  risk: null,
  riskError: null,
  asset: USDG,
  balance: 0n,
  allowance: 0n,
  ...over,
});

describe("a position on the pages of the six pools", () => {
  describe("positive", () => {
    it("is listed on the page of the pool its PoolKey hashes to, and can be deposited there", () => {
      for (const pool of COLLATERAL_POOLS) {
        const positions = COLLATERAL_POOLS.map((other, index) => found(other, BigInt(index + 1)));

        expect(inPool(positions, pool.poolId).map((position) => position.poolKey), pool.pair).toEqual([pool.key]);
        expect(depositCollateralGate(inWallet(pool), pool.poolId), pool.pair).toEqual({ ok: true });
      }
    });

    it("can be borrowed against on its own page once it is deposited", () => {
      for (const pool of COLLATERAL_POOLS) {
        const held = inWallet(pool, {
          place: "collateral",
          risk: { positionValue: 1_000n * WAD, maxBorrow: 300_000_000n, healthFactor: maxUint256 },
        });

        expect(borrowGate(held, 50_000_000n), pool.pair).toEqual({ ok: true });
      }
    });
  });

  describe("negative", () => {
    it("is not listed on the pages of the other five pools, and is refused there", () => {
      for (const pool of COLLATERAL_POOLS) {
        const others = COLLATERAL_POOLS.filter((other) => other.poolId !== pool.poolId);
        expect(others).toHaveLength(5);

        for (const other of others) {
          const name = `${pool.pair} on the ${other.pair} page`;
          expect(inPool([found(pool, 1n)], other.poolId), name).toEqual([]);
          expect(depositCollateralGate(inWallet(pool), other.poolId), name).toMatchObject({ ok: false, code: "WrongPool" });
        }
      }
    });
  });

  describe("edge case", () => {
    it("belongs on its page whatever the case the ids are written in", () => {
      for (const pool of COLLATERAL_POOLS) {
        const upper = pool.poolId.toUpperCase().replace("0X", "0x") as `0x${string}`;

        expect(inPool([found(pool, 1n)], upper), pool.pair).toHaveLength(1);
        expect(depositCollateralGate(inWallet(pool), upper), pool.pair).toEqual({ ok: true });
      }
    });

    it("is told apart from a position of the same pair in another pool: the page is the pool's, not the pair's", () => {
      const eth = COLLATERAL_POOLS.find((pool) => pool.pair === "ETH/USDG")!;
      // ETH/USDG at fee 460 without a hook: the same two tokens, another pool.
      const otherEth = { ...eth, key: { ...eth.key, fee: 460, tickSpacing: 9, hooks: "0x0000000000000000000000000000000000000000" as const } };

      expect(inPool([found(otherEth, 1n)], eth.poolId)).toEqual([]);
      expect(depositCollateralGate(inWallet(otherEth), eth.poolId)).toMatchObject({ ok: false, code: "WrongPool" });
    });
  });
});
