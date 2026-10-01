import { erc20Abi, maxUint256, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  borrow,
  collectFees,
  decreaseLiquidity,
  depositCollateral,
  increaseLiquidity,
  repay,
  supply,
  withdrawCollateral,
} from "@/lib/onchain/actions";
import { readAddition } from "@/lib/onchain/addition";
import { additionFor } from "@/lib/onchain/liquidity-math";
import { describePosition } from "@/lib/onchain/describe";
import { inPool, type Discovered } from "@/lib/onchain/discovery";
import { ActionError, explainForPool } from "@/lib/onchain/errors";
import { borrowGate, collectFeesGate, depositCollateralGate, repayGate, withdrawCollateralGate } from "@/lib/onchain/gates";
import { readPool, readPosition, type MarketRefs } from "@/lib/onchain/reads";
import { DEFAULT_TOLERANCE_BPS, liquidityFor, minimumsFor, readRemoval } from "@/lib/onchain/removal";
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
  deal,
  dealUsdg,
  debtOf,
  givePosition,
  hasAveragePrice,
  isolateEachTest,
  lowerLiquidationThreshold,
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
      expect(amounts!.base).toBeCloseTo(1.83440126, 6);
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

    it(`${pair}: the fees of a position with a loan are collected to the wallet, and the position stays deposited`, async () => {
      const { user, refs } = await holder(listed);
      await depositCollateral(user.clients, refs, tokenId);
      await borrow(user.clients, refs, tokenId, 50n * USDG);
      const before = await readPosition(publicClient, refs, tokenId, user.address);
      expect(before.holdings!.feesUsd).toBeGreaterThan(0n);
      expect(collectFeesGate(before)).toEqual({ ok: true });

      // The token paired with USDG: native ETH in the ETH pool, an ERC-20 in the other five.
      const usdgIsCurrency0 = pool.key.currency0.toLowerCase() === USDG_TOKEN.toLowerCase();
      const base = usdgIsCurrency0 ? pool.key.currency1 : pool.key.currency0;
      // What the app shows before the fees are collected, in each token.
      const { fees0, fees1 } = before.holdings!;
      const shown = usdgIsCurrency0 ? { usdg: fees0, base: fees1 } : { usdg: fees1, base: fees0 };
      const baseBalance = () =>
        base === zeroAddress
          ? publicClient.getBalance({ address: user.address })
          : publicClient.readContract({ address: base, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
      const baseBefore = await baseBalance();

      const receipt = await collectFees(user.clients, refs, tokenId);

      // Native ETH paid for the gas too, so what arrived is the change plus that.
      const gas = base === zeroAddress ? receipt.gasUsed * receipt.effectiveGasPrice : 0n;
      const gained = { usdg: (await usdgBalance(user.address)) - 50n * USDG, base: (await baseBalance()) + gas - baseBefore };
      expect(gained.usdg + gained.base, "nothing arrived").toBeGreaterThan(0n);
      // To the unit: what arrives is what was shown.
      expect(gained).toEqual(shown);

      const after = await readPosition(publicClient, refs, tokenId, user.address);
      expect(after.place).toBe("collateral");
      expect((await ownerOf(tokenId)).toLowerCase()).toBe(refs.market.toLowerCase());
      expect(after.holdings).toMatchObject({ fees0: 0n, fees1: 0n, feesUsd: 0n });
      // The principal is untouched: only the fees left.
      expect(after.holdings!.amount0).toBe(before.holdings!.amount0);
      expect(after.holdings!.amount1).toBe(before.holdings!.amount1);
      expect(after.debt).toBeGreaterThanOrEqual(50n * USDG);
      expect(after.risk!.healthFactor).toBeGreaterThan(10n ** 18n);
      expect(collectFeesGate(after)).toMatchObject({ ok: false, code: "NoFees" });
    });

    it(`${pair}: a quarter of the liquidity of a position with a loan is removed, at the default tolerance`, async () => {
      const { user, refs } = await holder(listed);
      await depositCollateral(user.clients, refs, tokenId);
      await borrow(user.clients, refs, tokenId, 50n * USDG);
      const before = await readPosition(publicClient, refs, tokenId, user.address);
      const liquidity = liquidityFor(before.holdings!.liquidity, 25);
      const { quote, refusal: refused } = await readRemoval(publicClient, refs.market, tokenId, user.address, liquidity);
      expect(refused).toBeNull();

      const usdgIsCurrency0 = pool.key.currency0.toLowerCase() === USDG_TOKEN.toLowerCase();
      const base = usdgIsCurrency0 ? pool.key.currency1 : pool.key.currency0;
      const baseBalance = () =>
        base === zeroAddress
          ? publicClient.getBalance({ address: user.address })
          : publicClient.readContract({ address: base, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });
      const baseBefore = await baseBalance();
      // What the panel shows before the removal: the principal the pool quotes and the fees, of each token.
      const { fees0, fees1 } = before.holdings!;
      const shown = usdgIsCurrency0
        ? { usdg: quote.principal0 + fees0, base: quote.principal1 + fees1 }
        : { usdg: quote.principal1 + fees1, base: quote.principal0 + fees0 };

      const receipt = await decreaseLiquidity(user.clients, refs, tokenId, { liquidity, ...minimumsFor(quote, DEFAULT_TOLERANCE_BPS) });

      const gas = base === zeroAddress ? receipt.gasUsed * receipt.effectiveGasPrice : 0n;
      const gained = { usdg: (await usdgBalance(user.address)) - 50n * USDG, base: (await baseBalance()) + gas - baseBefore };
      expect(gained).toEqual(shown);

      const after = await readPosition(publicClient, refs, tokenId, user.address);
      expect(after.place).toBe("collateral");
      expect(after.holdings).toMatchObject({ liquidity: before.holdings!.liquidity - liquidity, fees0: 0n, fees1: 0n });
      expect(after.risk!.healthFactor).toBeGreaterThan(10n ** 18n);
    });

    it(`${pair}: a quarter more liquidity is added to a position with a loan, for what was quoted, to the unit`, async () => {
      const { user, refs } = await holder(listed);
      await depositCollateral(user.clients, refs, tokenId);
      await borrow(user.clients, refs, tokenId, 50n * USDG);
      const usdgIsCurrency0 = pool.key.currency0.toLowerCase() === USDG_TOKEN.toLowerCase();
      const base = usdgIsCurrency0 ? pool.key.currency1 : pool.key.currency0;
      // Funds to add with: USDG, and the token paired with it. A new wallet holds 10 ETH already.
      await dealUsdg(user.address, 10_000n * USDG);
      if (base !== zeroAddress) await deal(base, user.address, 10n ** 30n);
      const baseBalance = () =>
        base === zeroAddress
          ? publicClient.getBalance({ address: user.address })
          : publicClient.readContract({ address: base, abi: erc20Abi, functionName: "balanceOf", args: [user.address] });

      const before = await readPosition(publicClient, refs, tokenId, user.address);
      const quote = await readAddition(publicClient, refs.market, tokenId, user.address, { share: 25 });
      const { need0, need1, max0, max1 } = additionFor(quote.price, quote.range, quote.liquidity, 50);
      const { fees0, fees1 } = before.holdings!;
      const [usdgBefore, baseBefore] = [await usdgBalance(user.address), await baseBalance()];
      const erc20s = [pool.key.currency0, pool.key.currency1].filter((currency) => currency !== zeroAddress);
      const approved = () =>
        Promise.all(
          erc20s.map((token) =>
            publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [user.address, quote.permit2] }),
          ),
        );
      const approvedBefore = await approved();
      let gas = 0n;
      const counting = {
        ...user.clients,
        publicClient: {
          ...user.clients.publicClient,
          waitForTransactionReceipt: async (args: { hash: `0x${string}` }) => {
            const mined = await publicClient.waitForTransactionReceipt(args);
            gas += mined.gasUsed * mined.effectiveGasPrice;
            return mined;
          },
        },
      } as never;

      await increaseLiquidity(counting, refs, tokenId, { liquidity: quote.liquidity, max0, max1 });

      // The pool took the need of each token, and the position's fees came back with the change.
      const paid = usdgIsCurrency0 ? { usdg: need0 - fees0, base: need1 - fees1 } : { usdg: need1 - fees1, base: need0 - fees0 };
      expect(usdgBefore - (await usdgBalance(user.address))).toBe(paid.usdg);
      expect(baseBefore - (await baseBalance()) - (base === zeroAddress ? gas : 0n)).toBe(paid.base);

      const after = await readPosition(publicClient, refs, tokenId, user.address);
      expect(after.holdings).toMatchObject({ liquidity: before.holdings!.liquidity + quote.liquidity, fees0: 0n, fees1: 0n });
      expect(after.risk!.healthFactor).toBeGreaterThan(before.risk!.healthFactor);
      // Nothing more is approved to Permit2 than before: the approval was for the maximum, and
      // Permit2 pulled the maximum. USDG starts and ends at zero. A token that gives Permit2 an
      // allowance of its own accord (AI does, without limit) is not approved by the app at all.
      expect(await approved()).toEqual(approvedBefore);
      expect(approvedBefore[erc20s.findIndex((token) => token.toLowerCase() === USDG_TOKEN.toLowerCase())]).toBe(0n);
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

describe("fees that are what keeps a loan healthy", () => {
  isolateEachTest();
  // AI/USDG: the position's fees are about $89 on $1,617 of principal, all of it counted as
  // collateral, so a loan at the pool's limit leans on them once the threshold is close.
  const listed = CASES[5];
  const { pool, tokenId } = listed;

  /** A loan of everything the position can borrow, in a pool whose threshold was then lowered to 31%. */
  async function loanAtTheEdge() {
    const { user, refs } = await holder(listed);
    await depositCollateral(user.clients, refs, tokenId);
    const { risk } = await readPosition(publicClient, refs, tokenId, user.address);
    await borrow(user.clients, refs, tokenId, risk!.maxBorrow);
    await lowerLiquidationThreshold(pool.id, 3100);
    return { user, refs, borrowed: risk!.maxBorrow };
  }

  describe("negative", () => {
    it("cannot be collected: the market refuses in simulation, with a sentence, and nothing is sent", async () => {
      const { user, refs, borrowed } = await loanAtTheEdge();
      const state = await readPosition(publicClient, refs, tokenId, user.address);
      // Healthy as it stands, by less than the fees are worth: 31% over 30% is 1.033.
      expect(state.pool.terms).toEqual({ maxLtvBps: 3000, ltBps: 3100 });
      expect(state.risk!.healthFactor).toBeGreaterThan(10n ** 18n);
      expect(state.risk!.healthFactor).toBeLessThan((104n * 10n ** 18n) / 100n);
      expect(state.holdings!.feesUsd * 100n).toBeGreaterThan(state.holdings!.principalUsd * 4n);
      // The gate cannot tell: the contract decides, in the simulation.
      expect(collectFeesGate(state)).toEqual({ ok: true });
      const nonce = await nonceOf(user.address);
      const steps: string[] = [];

      const refused = await refusal(collectFees(user.clients, refs, tokenId, (step) => steps.push(step.name)));

      expect(refused.code).toBe("PositionWouldBeUnhealthy");
      expect(refused.message).toMatch(/health factor would be below 1.*Repay part of the loan/);
      expect(steps, "the wallet was asked to confirm").toEqual([]);
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await usdgBalance(user.address)).toBe(borrowed);
      expect((await readPosition(publicClient, refs, tokenId, user.address)).holdings!.feesUsd).toBe(state.holdings!.feesUsd);
    });
  });

  describe("positive", () => {
    it("are collected once enough of the loan is repaid", async () => {
      const { user, refs, borrowed } = await loanAtTheEdge();
      await repay(user.clients, refs, tokenId, borrowed / 4n);

      await collectFees(user.clients, refs, tokenId);

      const after = await readPosition(publicClient, refs, tokenId, user.address);
      expect(after.holdings!.feesUsd).toBe(0n);
      expect(after.risk!.healthFactor).toBeGreaterThan(10n ** 18n);
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

    it("does not pay out the fees of a position with a loan: the market would have to price it", async () => {
      const { user, refs } = await holder(CASES[1]);
      await depositCollateral(user.clients, refs, tokenId);
      await borrow(user.clients, refs, tokenId, 50n * USDG);
      await quiet();

      const gate = collectFeesGate(await readPosition(publicClient, refs, tokenId, user.address));
      expect(gate).toMatchObject({ ok: false, code: "StalePrice" });
      expect(gate.ok === false && explainForPool(gate, page).message).toMatch(/collecting the fees of a position with a loan/);
      const nonce = await nonceOf(user.address);

      expect((await refusal(collectFees(user.clients, refs, tokenId))).code).toBe("StalePrice");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await usdgBalance(user.address)).toBe(50n * USDG);
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
    it("still pays out the fees of a position without a loan, which needs no price", async () => {
      const { user, refs } = await holder(CASES[1]);
      await depositCollateral(user.clients, refs, tokenId);
      const { fees0 } = (await readPosition(publicClient, refs, tokenId, user.address)).holdings!;
      expect(fees0).toBeGreaterThan(0n);
      await quiet();

      // The fees cannot be valued any more, and are still there to collect.
      const state = await readPosition(publicClient, refs, tokenId, user.address);
      expect(state.holdings).toBeNull();
      expect(collectFeesGate(state)).toEqual({ ok: true });
      await collectFees(user.clients, refs, tokenId);

      // USDG is currency0 in META/USDG.
      expect(await usdgBalance(user.address)).toBe(fees0);
    });

    it("lends against a price that is hours old, as long as it is not older than 25", async () => {
      const { user, refs } = await holder(CASES[1]);
      await depositCollateral(user.clients, refs, tokenId);

      // At the fork's block USDG's price is 16 hours and 23 minutes old and META's 35 minutes,
      // and the start of the fork adds the 35 minutes it records meme prices over. Seven hours
      // on, the oldest of the two is just under 24 hours old: old, and still accepted.
      await wait(7 * HOUR);

      const state = await readPosition(publicClient, refs, tokenId, user.address);
      expect(state.riskError).toBeNull();
      expect(borrowGate(state, 50n * USDG)).toEqual({ ok: true });
    });
  });
});
