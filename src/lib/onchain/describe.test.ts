import { maxUint256, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import { describePosition } from "./describe";
import type { PositionState } from "./reads";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WAD = 10n ** 18n;

/** A position in the ETH/USDG 0.046% pool, in the wallet, holding both tokens: $1,000 and $25 of fees. */
const inWallet = (over: Partial<PositionState> = {}): PositionState => ({
  tokenId: 1n,
  place: "wallet",
  poolId: "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32",
  poolKey: { currency0: zeroAddress, currency1: USDG, fee: 460, tickSpacing: 9, hooks: zeroAddress },
  // 1.0001^-198,599 × 1e12 is about $2,373, and 900 ticks up about $2,596.
  ticks: { tickLower: -198_599, tickUpper: -197_699 },
  decimals: [18, 6],
  holdings: { amount0: 2n * 10n ** 17n, amount1: 500_000_000n, principalUsd: 1_000n * WAD, feesUsd: 25n * WAD },
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

/** The same position deposited: the market lends against $1,010, fees capped and all. */
const collateral = (over: Partial<PositionState> = {}) =>
  inWallet({
    place: "collateral",
    risk: { positionValue: 1_010n * WAD, maxBorrow: 656_500_000n, healthFactor: maxUint256 },
    ...over,
  });

describe("describePosition", () => {
  describe("positive", () => {
    it("values a position in the wallet at what it holds plus its uncollected fees", () => {
      expect(describePosition(inWallet()).valueUsd).toBe(1_025);
    });

    it("values collateral at what the market lends against, not at what it holds", () => {
      expect(describePosition(collateral()).valueUsd).toBe(1_010);
    });

    it("says the fee, the range in USDG, and that the price is in it", () => {
      const described = describePosition(inWallet());

      expect(described.fee).toBe("0.046%");
      expect(described.range).toMatch(/^2,37\d(\.\d+)? to 2,59\d(\.\d+)? USDG$/);
      expect(described.inRange).toBe(true);
    });
  });

  describe("negative", () => {
    it("says out of range when the position holds one token only, either one", () => {
      const onlyUsdg = { amount0: 0n, amount1: 900_000_000n, principalUsd: 900n * WAD, feesUsd: 0n };
      const onlyEth = { amount0: 4n * 10n ** 17n, amount1: 0n, principalUsd: 900n * WAD, feesUsd: 0n };

      expect(describePosition(inWallet({ holdings: onlyUsdg })).inRange).toBe(false);
      expect(describePosition(inWallet({ holdings: onlyEth })).inRange).toBe(false);
    });

    it("shows no value and makes no claim about the range for a position the valuer could not price", () => {
      const described = describePosition(inWallet({ holdings: null }));

      expect(described.valueUsd).toBeNull();
      expect(described.inRange).toBeNull();
      // The ticks are still known, so the range itself is.
      expect(described.range).toMatch(/USDG$/);
      expect(described.fee).toBe("0.046%");
    });
  });

  describe("edge case", () => {
    it("does not call a position that holds nothing out of range", () => {
      // Collateral whose liquidity is gone: the market holds it, so it is listed.
      const empty = { amount0: 0n, amount1: 0n, principalUsd: 0n, feesUsd: 0n };
      const described = describePosition(collateral({ holdings: empty, risk: { positionValue: 0n, maxBorrow: 0n, healthFactor: maxUint256 } }));

      expect(described.inRange).toBeNull();
      expect(described.valueUsd).toBe(0);
    });

    it("values collateral the lens could not price at what it holds", () => {
      const unpriced = collateral({ risk: null, riskError: { code: "StalePrice", message: "stale" } });

      expect(describePosition(unpriced).valueUsd).toBe(1_025);
    });

    it("counts fees on a position that holds no principal on one side", () => {
      const holdings = { amount0: 0n, amount1: 900_000_000n, principalUsd: 900n * WAD, feesUsd: 12n * WAD };

      expect(describePosition(inWallet({ holdings })).valueUsd).toBe(912);
    });

    it("has nothing to say about a token that does not exist", () => {
      const missing = inWallet({ place: "missing", poolId: null, poolKey: null, ticks: null, decimals: null, holdings: null });

      expect(describePosition(missing)).toEqual({ fee: null, range: null, inRange: null, valueUsd: null });
    });

    it("writes a full range without prices", () => {
      expect(describePosition(inWallet({ ticks: { tickLower: -887_265, tickUpper: 887_265 } })).range).toBe("Full range");
    });
  });
});
