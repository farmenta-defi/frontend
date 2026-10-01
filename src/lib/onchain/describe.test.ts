import { maxUint256, zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";

import { describePosition, feesInWords } from "./describe";
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
  holdings: { amount0: 2n * 10n ** 17n, amount1: 500_000_000n, fees0: 0n, fees1: 0n, principalUsd: 1_000n * WAD, feesUsd: 25n * WAD },
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

    it("gives the uncollected fees in full, as a figure of their own", () => {
      expect(describePosition(inWallet()).feesUsd).toBe(25);
      expect(describePosition(collateral()).feesUsd).toBe(25);
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
      const onlyUsdg = { amount0: 0n, amount1: 900_000_000n, fees0: 0n, fees1: 0n, principalUsd: 900n * WAD, feesUsd: 0n };
      const onlyEth = { amount0: 4n * 10n ** 17n, amount1: 0n, fees0: 0n, fees1: 0n, principalUsd: 900n * WAD, feesUsd: 0n };

      expect(describePosition(inWallet({ holdings: onlyUsdg })).inRange).toBe(false);
      expect(describePosition(inWallet({ holdings: onlyEth })).inRange).toBe(false);
    });

    it("shows no value and makes no claim about the range for a position the valuer could not price", () => {
      const described = describePosition(inWallet({ holdings: null }));

      expect(described.valueUsd).toBeNull();
      expect(described.feesUsd).toBeNull();
      expect(described.inRange).toBeNull();
      // The ticks are still known, so the range itself is.
      expect(described.range).toMatch(/USDG$/);
      expect(described.fee).toBe("0.046%");
    });
  });

  describe("edge case", () => {
    it("does not call a position that holds nothing out of range", () => {
      // Collateral whose liquidity is gone: the market holds it, so it is listed.
      const empty = { amount0: 0n, amount1: 0n, fees0: 0n, fees1: 0n, principalUsd: 0n, feesUsd: 0n };
      const described = describePosition(collateral({ holdings: empty, risk: { positionValue: 0n, maxBorrow: 0n, healthFactor: maxUint256 } }));

      expect(described.inRange).toBeNull();
      expect(described.valueUsd).toBe(0);
    });

    it("keeps collateral and fees apart when the fees are over a tenth of the principal", () => {
      // $1,000 of principal and $250 of fees. The market counts $100 of them: (1,000 + 100) with no haircut.
      const holdings = { amount0: 2n * 10n ** 17n, amount1: 500_000_000n, fees0: 0n, fees1: 0n, principalUsd: 1_000n * WAD, feesUsd: 250n * WAD };
      const risk = { positionValue: 1_100n * WAD, maxBorrow: 715_000_000n, healthFactor: maxUint256 };

      const described = describePosition(collateral({ holdings, risk }));

      expect(described.valueUsd).toBe(1_100);
      expect(described.feesUsd).toBe(250);
    });

    it("still gives the fees of collateral the lens could not price", () => {
      const unpriced = collateral({ risk: null, riskError: { code: "StalePrice", message: "stale" } });

      expect(describePosition(unpriced).feesUsd).toBe(25);
    });

    it("reports no fees as zero, which is a figure", () => {
      const holdings = { amount0: 0n, amount1: 900_000_000n, fees0: 0n, fees1: 0n, principalUsd: 900n * WAD, feesUsd: 0n };

      expect(describePosition(inWallet({ holdings })).feesUsd).toBe(0);
    });

    it("values collateral the lens could not price at what it holds", () => {
      const unpriced = collateral({ risk: null, riskError: { code: "StalePrice", message: "stale" } });

      expect(describePosition(unpriced).valueUsd).toBe(1_025);
    });

    it("counts fees on a position that holds no principal on one side", () => {
      const holdings = { amount0: 0n, amount1: 900_000_000n, fees0: 0n, fees1: 0n, principalUsd: 900n * WAD, feesUsd: 12n * WAD };

      expect(describePosition(inWallet({ holdings })).valueUsd).toBe(912);
    });

    it("has nothing to say about a token that does not exist", () => {
      const missing = inWallet({ place: "missing", poolId: null, poolKey: null, ticks: null, decimals: null, holdings: null });

      expect(describePosition(missing)).toEqual({
        fee: null,
        range: null,
        inRange: null,
        valueUsd: null,
        feesUsd: null,
        amounts: null,
        fees: null,
      });
    });

    it("writes a full range without prices", () => {
      expect(describePosition(inWallet({ ticks: { tickLower: -887_265, tickUpper: 887_265 } })).range).toBe("Full range");
    });
  });
});

/**
 * What each side of a pool holds, over positions as the chain had them at
 * block 75,422,200 (`test/fork/support/constants.ts`): the amounts are the
 * valuer's and the ticks PositionManager's.
 */
describe("the amounts and the prices of a position, by the side USDG is on", () => {
  const META: Address = "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35";
  const NVDA: Address = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";
  const CASHCAT: Address = "0x020bfC650A365f8BB26819deAAbF3E21291018b4";

  /** ETH/USDG 3,402,463: native ETH is currency0, USDG currency1. */
  const eth = inWallet({
    poolKey: { currency0: zeroAddress, currency1: USDG, fee: 0x800000, tickSpacing: 10, hooks: "0x06a889870C8f83640D6816319f72e2aA579b6080" },
    ticks: { tickLower: -199_030, tickUpper: -196_040 },
    decimals: [18, 6],
    holdings: { amount0: 243_723_219_459_019_262n, amount1: 744_229_053n, fees0: 0n, fees1: 0n, principalUsd: 1_394n * WAD, feesUsd: 0n },
  });
  /** META/USDG 3,150,520: USDG is currency0. */
  const meta = inWallet({
    poolKey: { currency0: USDG, currency1: META, fee: 3000, tickSpacing: 60, hooks: zeroAddress },
    ticks: { tickLower: 208_260, tickUpper: 211_620 },
    decimals: [6, 18],
    holdings: { amount0: 412_294_036n, amount1: 1_372_749_240_445_278_056n, fees0: 0n, fees1: 0n, principalUsd: 1_388n * WAD, feesUsd: 0n },
  });
  /** NVDA/USDG 3,387,125: USDG is currency0. */
  const nvda = inWallet({
    poolKey: { currency0: USDG, currency1: NVDA, fee: 100, tickSpacing: 1, hooks: zeroAddress },
    ticks: { tickLower: 221_360, tickUpper: 222_407 },
    decimals: [6, 18],
    holdings: { amount0: 688_745_603n, amount1: 5_068_366_222_906_480_101n, fees0: 0n, fees1: 0n, principalUsd: 1_845n * WAD, feesUsd: 0n },
  });
  /** CASHCAT/USDG 3,400,223: USDG is currency1, and the token is worth cents. */
  const cashcat = inWallet({
    poolKey: { currency0: CASHCAT, currency1: USDG, fee: 2690, tickSpacing: 54, hooks: zeroAddress },
    ticks: { tickLower: -295_974, tickUpper: -290_196 },
    decimals: [18, 6],
    holdings: { amount0: 6_496_291_265_759_436_928_863n, amount1: 672_443_789n, fees0: 0n, fees1: 0n, principalUsd: 1_796n * WAD, feesUsd: 0n },
  });

  describe("positive", () => {
    it("reads the ETH of a native-ETH position in 18 decimals and its USDG in 6", () => {
      const { amounts, range, fee } = describePosition(eth);

      expect(amounts!.base).toBeCloseTo(0.243723219, 9);
      expect(amounts!.usdg).toBe(744.229053);
      expect(range).toBe("2,273.4 to 3,065.6 USDG");
      expect(fee).toBe("Dynamic fee");
    });

    it("reads the amounts of a stock position the right way round, where USDG is currency0", () => {
      const held = { meta: describePosition(meta).amounts!, nvda: describePosition(nvda).amounts! };

      expect(held.meta.base).toBeCloseTo(1.372749240445, 12);
      expect(held.meta.usdg).toBe(412.294036);
      expect(held.nvda.base).toBeCloseTo(5.068366222906, 12);
      expect(held.nvda.usdg).toBe(688.745603);
    });

    it("prices a stock in USDG, not USDG in the stock, where USDG is currency0", () => {
      // META traded at about 713 USDG and NVDA at about 229 at that block.
      expect(describePosition(meta).range).toBe("645.5 to 903.3 USDG");
      expect(describePosition(nvda).range).toBe("219.5 to 243.7 USDG");
      expect(describePosition(meta).fee).toBe("0.3%");
      expect(describePosition(nvda).fee).toBe("0.01%");
    });

    it("prices a token worth cents in USDG", () => {
      const { amounts, range } = describePosition(cashcat);

      expect(amounts!.base).toBeCloseTo(6_496.291265759, 6);
      expect(amounts!.usdg).toBe(672.443789);
      expect(range).toBe("0.1402 to 0.2498 USDG");
    });
  });

  describe("negative", () => {
    it("does not take the first amount for the token and the second for USDG where they are the other way round", () => {
      const { amounts } = describePosition(meta);

      // Read as currency1 = USDG, this position would hold 412 META and a millionth of a millionth of a USDG.
      expect(amounts!.base).not.toBeCloseTo(412.294036, 3);
      expect(amounts!.usdg).toBeGreaterThan(400);
    });

    it("has no amounts for a position that could not be valued, or of a pool without USDG", () => {
      expect(describePosition(inWallet({ holdings: null })).amounts).toBeNull();
      const noUsdg = { ...meta, poolKey: { ...meta.poolKey!, currency0: NVDA } };
      expect(describePosition(noUsdg).amounts).toBeNull();
    });
  });

  describe("edge case", () => {
    it("reads a position that holds only the token, or only USDG, on either side", () => {
      // META/USDG 3,396,204, above its range in USDG terms: all META.
      const allMeta = { ...meta, holdings: { amount0: 0n, amount1: 453_057_429_999_999_450n, fees0: 0n, fees1: 0n, principalUsd: 322n * WAD, feesUsd: 0n } };
      // ETH/USDG 3,370,167, above its range: all USDG.
      const allUsdg = { ...eth, holdings: { amount0: 0n, amount1: 199_999_999n, fees0: 0n, fees1: 0n, principalUsd: 199n * WAD, feesUsd: 0n } };

      expect(describePosition(allMeta).amounts!.base).toBeCloseTo(0.45305743, 12);
      expect(describePosition(allMeta).amounts!.usdg).toBe(0);
      expect(describePosition(allUsdg).amounts).toEqual({ base: 0, usdg: 199.999999 });
      expect(describePosition(allMeta).inRange).toBe(false);
      expect(describePosition(allUsdg).inRange).toBe(false);
    });

    it("tells USDG by its address whatever the case it is written in", () => {
      const lower = { ...meta, asset: USDG.toLowerCase() as `0x${string}` };

      expect(describePosition(lower).amounts).toEqual(describePosition(meta).amounts);
    });
  });
});

describe("the fees a position has earned, in its two tokens", () => {
  // 0.0005 ETH and 1.25 USDG, in a pool where USDG is currency1.
  const earned = { amount0: 2n * 10n ** 17n, amount1: 500_000_000n, fees0: 5n * 10n ** 14n, fees1: 1_250_000n, principalUsd: 1_000n * WAD, feesUsd: 25n * WAD / 10n };

  describe("positive", () => {
    it("names them as the pair does, the other token first and USDG second", () => {
      expect(describePosition(collateral({ holdings: earned })).fees).toEqual({ base: 0.0005, usdg: 1.25 });
      expect(feesInWords({ base: 0.0005, usdg: 1.25 }, "ETH")).toBe("0.0005 ETH and 1.25 USDG");
    });

    it("tells USDG by its address where it is currency0", () => {
      const usdgFirst = collateral({
        poolKey: { currency0: USDG, currency1: "0x00000000000000000000000000000000000000aa", fee: 3000, tickSpacing: 60, hooks: zeroAddress },
        decimals: [6, 18],
        holdings: { ...earned, fees0: 1_250_000n, fees1: 5n * 10n ** 14n },
      });

      expect(describePosition(usdgFirst).fees).toEqual({ base: 0.0005, usdg: 1.25 });
    });
  });

  describe("negative", () => {
    it("has no amounts for a position that could not be valued, and no words for them", () => {
      const unpriced = collateral({ holdings: null });

      expect(describePosition(unpriced).fees).toBeNull();
      expect(feesInWords(null, "ETH")).toBeNull();
    });
  });

  describe("edge case", () => {
    it("names the one token there is any of", () => {
      expect(feesInWords({ base: 0, usdg: 0.5 }, "ETH")).toBe("0.5 USDG");
      expect(feesInWords({ base: 0.0005, usdg: 0 }, "ETH")).toBe("0.0005 ETH");
    });

    it("names nothing where both are zero", () => {
      expect(feesInWords({ base: 0, usdg: 0 }, "ETH")).toBeNull();
    });

    it("is not the principal: a position holds both and the two are read apart", () => {
      const described = describePosition(collateral({ holdings: earned }));

      expect(described.amounts).toEqual({ base: 0.2, usdg: 500 });
      expect(described.fees).toEqual({ base: 0.0005, usdg: 1.25 });
    });
  });
});
