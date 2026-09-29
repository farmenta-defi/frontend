import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";

import { borrow, depositCollateral, repay, supply, withdrawCollateral } from "@/lib/onchain/actions";
import { describePosition } from "@/lib/onchain/describe";
import { inPool, type Discovered } from "@/lib/onchain/discovery";
import { ActionError, explainForPool } from "@/lib/onchain/errors";
import { borrowGate, depositCollateralGate, repayGate, withdrawCollateralGate } from "@/lib/onchain/gates";
import { readPool, readPosition, type MarketRefs } from "@/lib/onchain/reads";
import { COLLATERAL_POOLS, poolById } from "@/lib/markets";

import {
  AI_USDG,
  CASHCAT_USDG,
  ETH_USDG,
  LISTED_POOLS,
  META_USDG,
  NVDA_USDG,
  PONS_USDG,
  POSITIONS,
  USDG as USDG_TOKEN,
  WETH_USDG_UNLISTED,
} from "./support/constants";
import {
  blueChip,
  dealUsdg,
  debtOf,
  givePosition,
  hasAveragePrice,
  isolateEachTest,
  meme,
  newUser,
  nonceOf,
  ownerOf,
  publicClient,
  recordPrice,
  usdgBalance,
  wait,
} from "./support/fork";

/**
 * The six listed pools, each through its own page's flow: a real position is
 * deposited, borrowed against, repaid and taken back.
 *
 * The pools differ in what the flow touches: native ETH or two ERC-20s, USDG
 * as currency0 or as currency1, a hook and a dynamic fee or neither, Chainlink
 * or the recorded 30-minute average. Each pool's terms are its own.
 */
const USDG = 1_000_000n;
/** ETH/USDG at fee 460, no hook: the pool the app's ETH/USDG page was for until the listed one replaced it. */
const OLD_ETH_USDG: `0x${string}` = "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32";
const MINUTE = 60;
const HOUR = 60 * MINUTE;

const CASES = [
  { pool: ETH_USDG, tokenId: POSITIONS.ethUsdgInRange, maxLtvBps: 6500, ltBps: 7500, what: "native ETH, a hook and a dynamic fee" },
  { pool: META_USDG, tokenId: POSITIONS.metaUsdgInRange, maxLtvBps: 5000, ltBps: 6500, what: "a stock, USDG as currency0" },
  { pool: NVDA_USDG, tokenId: POSITIONS.nvdaUsdgInRange, maxLtvBps: 5000, ltBps: 6500, what: "a stock, USDG as currency0, tick spacing 1" },
  { pool: CASHCAT_USDG, tokenId: POSITIONS.cashcatUsdgInRange, maxLtvBps: 3000, ltBps: 4000, what: "a meme token, priced by the recorded average" },
  { pool: PONS_USDG, tokenId: POSITIONS.ponsUsdgInRange, maxLtvBps: 3000, ltBps: 4000, what: "a meme token, a hook and a dynamic fee" },
  { pool: AI_USDG, tokenId: POSITIONS.aiUsdgInRange, maxLtvBps: 3000, ltBps: 4000, what: "a meme token" },
] as const;

const refsOf = (tier: "blue-chip" | "meme"): MarketRefs => (tier === "meme" ? meme : blueChip);
const pairOf = (id: `0x${string}`) => poolById(id)!.pair;

async function refusal(action: Promise<unknown>) {
  const error = await action.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error, "the action went through").toBeInstanceOf(ActionError);
  return error as ActionError;
}

/** A lender's USDG in the market, so there is something to borrow. */
async function fund(refs: MarketRefs, amount = 5_000n * USDG) {
  const lender = await newUser("funding-lender");
  await dealUsdg(lender.address, amount);
  await supply(lender.clients, refs, amount);
}

/** A wallet holding `tokenId`, in a market with cash. For a meme pool the keeper has just recorded the price. */
async function holder({ pool, tokenId }: (typeof CASES)[number]) {
  const refs = refsOf(pool.tier);
  await fund(refs);
  if (pool.tier === "meme") await recordPrice(pool.key);
  const user = await newUser("borrower");
  await givePosition(user.address, tokenId);
  return { user, refs };
}

describe("the six pools on the fork", () => {
  isolateEachTest();

  describe("positive", () => {
    it("are the pools of the app, each listed in its market and on its own terms", async () => {
      expect(LISTED_POOLS.map((pool) => pool.id)).toEqual(COLLATERAL_POOLS.map((pool) => pool.poolId));
      for (const { pool, maxLtvBps, ltBps } of CASES) {
        const listed = await readPool(publicClient, blueChip.policy, pool.id);
        expect(listed, pairOf(pool.id)).toEqual({ status: "open", terms: { maxLtvBps, ltBps } });
        expect(poolById(pool.id)!.tier, pairOf(pool.id)).toBe(pool.tier);
      }
    });

    it("have 30 minutes of prices recorded where they are meme pools, the last one fresh", async () => {
      for (const pool of [CASHCAT_USDG, PONS_USDG, AI_USDG]) {
        await recordPrice(pool.key);
        expect(await hasAveragePrice(pool.id), pairOf(pool.id)).toBe(true);
      }
    });
  });

  describe("negative", () => {
    it("do not include the pools the app had a page for before: neither is listed on the chain", async () => {
      for (const pool of [WETH_USDG_UNLISTED.id, OLD_ETH_USDG]) {
        expect(await readPool(publicClient, blueChip.policy, pool), pool).toEqual({ status: "unlisted", terms: null });
        expect(poolById(pool), pool).toBeNull();
      }
    });

    it("refuse a position of a pool that is not listed, in either market", async () => {
      const user = await newUser("borrower");
      await givePosition(user.address, POSITIONS.unlistedPool);

      for (const refs of [blueChip, meme]) {
        const state = await readPosition(publicClient, refs, POSITIONS.unlistedPool, user.address);
        expect(state.poolId).toBe(WETH_USDG_UNLISTED.id);
        expect(depositCollateralGate(state)).toMatchObject({ ok: false, code: "PoolNotListed" });
        expect(borrowGate(state, 50n * USDG)).toMatchObject({ ok: false, code: "PoolNotListed" });
      }
    });
  });

  describe("edge case", () => {
    it("a position in a stock pool, where USDG is currency0, may hold the stock and no USDG", async () => {
      await fund(blueChip);
      const user = await newUser("borrower");
      await givePosition(user.address, POSITIONS.metaUsdgAllMeta);

      const state = await readPosition(publicClient, blueChip, POSITIONS.metaUsdgAllMeta, user.address);
      const { amounts, inRange } = describePosition(state);

      expect(state.holdings!.amount0).toBe(0n);
      expect(amounts!.usdg).toBe(0);
      expect(amounts!.base).toBeCloseTo(0.45305743, 6);
      expect(inRange).toBe(false);
      await depositCollateral(user.clients, blueChip, POSITIONS.metaUsdgAllMeta);
      expect((await readPosition(publicClient, blueChip, POSITIONS.metaUsdgAllMeta, user.address)).place).toBe("collateral");
    });

    it("a position in the ETH pool may hold USDG and no ETH", async () => {
      const user = await newUser("borrower");
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);

      const { amounts } = describePosition(
        await readPosition(publicClient, blueChip, POSITIONS.ethUsdgAboveRange, user.address),
      );

      expect(amounts).toEqual({ base: 0, usdg: 199.999999 });
    });
  });
});

describe.each(CASES)("$pool.id, $what", (listed) => {
  isolateEachTest();
  const { pool, tokenId, maxLtvBps, ltBps } = listed;
  const pair = pairOf(pool.id);

  describe("positive", () => {
    it(`${pair}: a real position is deposited, borrowed against, repaid and taken back`, async () => {
      const { user, refs } = await holder(listed);
      const before = await readPosition(publicClient, refs, tokenId, user.address);
      expect(before.place).toBe("wallet");
      expect(before.poolId).toBe(pool.id);
      expect(before.poolKey).toEqual(pool.key);
      expect(before.holdingsError).toBeNull();
      expect(depositCollateralGate(before, pool.id)).toEqual({ ok: true });

      await depositCollateral(user.clients, refs, tokenId);

      expect((await ownerOf(tokenId)).toLowerCase()).toBe(refs.market.toLowerCase());
      const held = await readPosition(publicClient, refs, tokenId, user.address);
      expect(held.place).toBe("collateral");
      expect(held.pool).toEqual({ status: "open", terms: { maxLtvBps, ltBps } });
      expect(held.risk!.healthFactor).toBe(maxUint256);
      // maxBorrow is the pool's own max LTV of the value, in USDG at the oracle's price,
      // and the market only lends while that price is within $0.97 to $1.03.
      const atMaxLtv = (held.risk!.positionValue * BigInt(maxLtvBps)) / 10_000n / 10n ** 12n;
      expect(held.risk!.maxBorrow).toBeGreaterThanOrEqual((atMaxLtv * 100n) / 103n);
      expect(held.risk!.maxBorrow).toBeLessThanOrEqual((atMaxLtv * 100n) / 97n);

      expect(borrowGate(held, 50n * USDG)).toEqual({ ok: true });
      await borrow(user.clients, refs, tokenId, 50n * USDG);
      expect(await usdgBalance(user.address)).toBe(50n * USDG);
      const owing = await readPosition(publicClient, refs, tokenId, user.address);
      expect(owing.debt).toBeGreaterThanOrEqual(50n * USDG);
      expect(owing.risk!.healthFactor).toBeGreaterThan(10n ** 18n);
      expect(withdrawCollateralGate(owing)).toMatchObject({ ok: false, code: "OutstandingDebt" });

      await dealUsdg(user.address, 60n * USDG);
      expect(repayGate(await readPosition(publicClient, refs, tokenId, user.address), "max")).toEqual({ ok: true });
      await repay(user.clients, refs, tokenId, "max");
      expect(await debtOf(refs.market, tokenId)).toBe(0n);

      await withdrawCollateral(user.clients, refs, tokenId);
      expect(await ownerOf(tokenId)).toBe(user.address);
      expect((await readPosition(publicClient, refs, tokenId, user.address)).place).toBe("wallet");
    });

    it(`${pair}: the position is shown by what it holds of each token, and priced in USDG`, async () => {
      const { user, refs } = await holder(listed);

      const state = await readPosition(publicClient, refs, tokenId, user.address);
      const { amounts, range, inRange, valueUsd } = describePosition(state);

      const usdgIsCurrency0 = pool.key.currency0.toLowerCase() === USDG_TOKEN.toLowerCase();
      expect(state.asset.toLowerCase()).toBe(USDG_TOKEN.toLowerCase());
      expect(state.decimals).toEqual(usdgIsCurrency0 ? [6, 18] : [18, 6]);
      // The USDG the app shows is the amount the valuer reports on USDG's side of the pool.
      const usdg = usdgIsCurrency0 ? state.holdings!.amount0 : state.holdings!.amount1;
      const base = usdgIsCurrency0 ? state.holdings!.amount1 : state.holdings!.amount0;
      expect(amounts!.usdg).toBe(Number(usdg) / 1e6);
      expect(amounts!.base).toBeCloseTo(Number(base) / 1e18, 9);
      expect(amounts!.usdg).toBeGreaterThan(0);
      expect(amounts!.base).toBeGreaterThan(0);
      expect(inRange).toBe(true);
      expect(valueUsd).toBeGreaterThan(1_000);
      expect(valueUsd).toBeLessThan(2_500);

      // The range is the price of the pair's token in USDG, low end first, and holds the price
      // the position is worth at: its USDG side over its token side would be far outside it
      // were the two read the wrong way round.
      const [low, high] = range!.replace(" USDG", "").split(" to ").map((end) => Number(end.replace(/,/g, "")));
      expect(low).toBeLessThan(high);
      const price = (valueUsd! - amounts!.usdg) / amounts!.base;
      expect(price).toBeGreaterThan(low * 0.97);
      expect(price).toBeLessThan(high * 1.03);
    });
  });

  describe("negative", () => {
    it(`${pair}: the position belongs on its own pool's page and on none of the other five`, async () => {
      const { user, refs } = await holder(listed);
      const state = await readPosition(publicClient, refs, tokenId, user.address);
      const found = [{ tokenId, poolId: state.poolId! }] as unknown as Discovered[];

      expect(inPool(found, pool.id)).toHaveLength(1);
      for (const other of LISTED_POOLS.filter((item) => item.id !== pool.id)) {
        expect(inPool(found, other.id), pairOf(other.id)).toEqual([]);
        expect(depositCollateralGate(state, other.id), pairOf(other.id)).toMatchObject({ ok: false, code: "WrongPool" });
      }
    });

    it(`${pair}: the other market refuses the position`, async () => {
      const { user } = await holder(listed);
      const other = refsOf(pool.tier === "meme" ? "blue-chip" : "meme");
      const nonce = await nonceOf(user.address);

      const refused = await refusal(depositCollateral(user.clients, other, tokenId));

      expect(refused.code).toBe("WrongTier");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await ownerOf(tokenId)).toBe(user.address);
    });
  });

  describe("edge case", () => {
    it(`${pair}: more than the pool's own max LTV is refused, and nothing is sent`, async () => {
      const { user, refs } = await holder(listed);
      await depositCollateral(user.clients, refs, tokenId);
      const state = await readPosition(publicClient, refs, tokenId, user.address);
      const tooMuch = state.risk!.maxBorrow + 1n * USDG;
      expect(borrowGate(state, tooMuch)).toMatchObject({ ok: false, code: "BorrowExceedsMaxLtv" });
      const nonce = await nonceOf(user.address);

      const refused = await refusal(borrow(user.clients, refs, tokenId, tooMuch));

      expect(refused.code).toBe("BorrowExceedsMaxLtv");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await debtOf(refs.market, tokenId)).toBe(0n);
    });
  });
});

describe("a meme pool while the keeper is quiet", () => {
  isolateEachTest();
  const { pool, tokenId } = CASES[3];

  describe("positive", () => {
    it("takes a position and lends against it: the market records the price itself", async () => {
      const { user, refs } = await holder(CASES[3]);
      // Twenty minutes without a recording. The oracle takes one for fresh for 900 seconds.
      await wait(20 * MINUTE);
      expect(await hasAveragePrice(pool.id), "the average is still fresh").toBe(false);

      const state = await readPosition(publicClient, refs, tokenId, user.address);
      expect(state.holdingsError).toBeNull();
      expect(state.holdings!.principalUsd).toBeGreaterThan(1_000n * 10n ** 18n);
      expect(depositCollateralGate(state, pool.id)).toEqual({ ok: true });
      await depositCollateral(user.clients, refs, tokenId);

      await wait(20 * MINUTE);
      const held = await readPosition(publicClient, refs, tokenId, user.address);
      expect(held.riskError).toBeNull();
      expect(borrowGate(held, 50n * USDG)).toEqual({ ok: true });
      await borrow(user.clients, refs, tokenId, 50n * USDG);

      expect(await usdgBalance(user.address)).toBe(50n * USDG);
    });
  });

  describe("negative", () => {
    it("still holds the loan to the pool's max LTV, at the price the market would record", async () => {
      const { user, refs } = await holder(CASES[3]);
      await depositCollateral(user.clients, refs, tokenId);
      await wait(20 * MINUTE);

      const held = await readPosition(publicClient, refs, tokenId, user.address);
      const tooMuch = held.risk!.maxBorrow + 1n * USDG;

      expect(borrowGate(held, tooMuch)).toMatchObject({ ok: false, code: "BorrowExceedsMaxLtv" });
      expect((await refusal(borrow(user.clients, refs, tokenId, tooMuch))).code).toBe("BorrowExceedsMaxLtv");
    });
  });

  describe("edge case", () => {
    it("reads what the next transaction will find, and leaves no recording behind", async () => {
      const { user, refs } = await holder(CASES[3]);
      await wait(20 * MINUTE);

      await readPosition(publicClient, refs, tokenId, user.address);

      // The recording ran inside an eth_call: the chain has none, and the plain read still fails.
      expect(await hasAveragePrice(pool.id)).toBe(false);
    });
  });
});

describe("a stock pool while its price feed is quiet", () => {
  isolateEachTest();
  const { pool, tokenId } = CASES[1];
  const page = poolById(pool.id)!;

  /**
   * A day and two hours without a price: longer than the 25 hours the oracle
   * accepts, as a stock's feed is every weekend. Time on a fork passes for
   * every feed at once, so USDG's is as old as META's here; what the pool does
   * about a price that is too old is the same whichever feed it is.
   */
  const quiet = () => wait(26 * HOUR);

  describe("negative", () => {
    it("takes no new collateral, says that the stock market is closed, and asks for no signature", async () => {
      const { user, refs } = await holder(CASES[1]);
      await quiet();

      const state = await readPosition(publicClient, refs, tokenId, user.address);
      const gate = depositCollateralGate(state, pool.id);
      expect(state.holdings).toBeNull();
      expect(gate).toMatchObject({ ok: false, code: "StalePrice" });
      expect(gate.ok === false && explainForPool(gate, page).message).toMatch(/META.*stock market is closed/);

      const nonce = await nonceOf(user.address);
      const steps: string[] = [];
      const refused = await refusal(depositCollateral(user.clients, refs, tokenId, (step) => steps.push(step.name)));

      expect(refused.code).toBe("StalePrice");
      expect(steps, "a signature was asked for").toEqual([]);
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await ownerOf(tokenId)).toBe(user.address);
    });

    it("gives no new loan, and does not let collateral with a loan against it go", async () => {
      const { user, refs } = await holder(CASES[1]);
      await depositCollateral(user.clients, refs, tokenId);
      await borrow(user.clients, refs, tokenId, 50n * USDG);
      await quiet();

      const state = await readPosition(publicClient, refs, tokenId, user.address);
      const gate = borrowGate(state, 10n * USDG);
      expect(state.risk).toBeNull();
      expect(gate).toMatchObject({ ok: false, code: "StalePrice" });
      expect(gate.ok === false && explainForPool(gate, page).message).toMatch(/open again when the stock market does/);
      const nonce = await nonceOf(user.address);

      expect((await refusal(borrow(user.clients, refs, tokenId, 10n * USDG))).code).toBe("StalePrice");
      expect((await refusal(withdrawCollateral(user.clients, refs, tokenId))).code).toBe("OutstandingDebt");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
    });
  });

  describe("positive", () => {
    it("still takes a repayment, and lets the collateral go once nothing is owed", async () => {
      const { user, refs } = await holder(CASES[1]);
      await depositCollateral(user.clients, refs, tokenId);
      await borrow(user.clients, refs, tokenId, 50n * USDG);
      await quiet();
      await dealUsdg(user.address, 60n * USDG);

      const state = await readPosition(publicClient, refs, tokenId, user.address);
      expect(state.debt).toBeGreaterThan(50n * USDG);
      expect(repayGate(state, "max")).toEqual({ ok: true });
      await repay(user.clients, refs, tokenId, "max");
      await withdrawCollateral(user.clients, refs, tokenId);

      expect(await debtOf(refs.market, tokenId)).toBe(0n);
      expect(await ownerOf(tokenId)).toBe(user.address);
    });
  });

  describe("edge case", () => {
    it("lends against a price that is hours old, as long as it is not older than 25", async () => {
      const { user, refs } = await holder(CASES[1]);
      await depositCollateral(user.clients, refs, tokenId);

      // At the fork's block USDG's price is 14 hours and 17 minutes old and META's 20 minutes.
      // Nine hours on, the oldest of the two is 23 hours old: old, and still accepted.
      await wait(9 * HOUR);

      const state = await readPosition(publicClient, refs, tokenId, user.address);
      expect(state.riskError).toBeNull();
      expect(borrowGate(state, 50n * USDG)).toEqual({ ok: true });
    });
  });
});
