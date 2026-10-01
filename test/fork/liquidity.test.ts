import { describe, expect, it } from "vitest";

import { borrow, decreaseLiquidity, depositCollateral, supply } from "@/lib/onchain/actions";
import { ActionError } from "@/lib/onchain/errors";
import { decreaseLiquidityGate } from "@/lib/onchain/gates";
import { readPosition } from "@/lib/onchain/reads";
import { DEFAULT_TOLERANCE_BPS, liquidityFor, minimumsFor, readRemoval } from "@/lib/onchain/removal";

import { ETH_USDG, POSITIONS } from "./support/constants";
import {
  blueChip,
  dealUsdg,
  givePosition,
  isolateEachTest,
  liquidityOf,
  movePoolPrice,
  newUser,
  nonceOf,
  ownerOf,
  publicClient,
  updateTerms,
  usdgBalance,
} from "./support/fork";

/**
 * Removing part of a deposited position's liquidity (FAR-73), on the ETH/USDG
 * pool: native ETH as currency0, USDG as currency1, a hook and a dynamic fee.
 * The other five pools go through the same removal in `pools.test.ts`, and
 * what a paused market and a frozen pool do about it is in `conditions.test.ts`.
 */
const USDG = 1_000_000n;
const WAD = 10n ** 18n;
const { market } = blueChip;
const TOKEN = POSITIONS.ethUsdgInRange;

async function refusal(action: Promise<unknown>) {
  const error = await action.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error, "the action went through").toBeInstanceOf(ActionError);
  return error as ActionError;
}

/** A borrower whose `tokenId` is deposited, in a market with cash. */
async function depositor(tokenId: bigint = TOKEN) {
  const lender = await newUser("funding-lender");
  await dealUsdg(lender.address, 50_000n * USDG);
  await supply(lender.clients, blueChip, 50_000n * USDG);
  const user = await newUser("borrower");
  await givePosition(user.address, tokenId);
  await depositCollateral(user.clients, blueChip, tokenId);
  return user;
}

const position = (tokenId: bigint, account: `0x${string}`) => readPosition(publicClient, blueChip, tokenId, account);

/** What the panel reads for a share of a position: its state, and the removal's quote and verdict. */
async function removalOf(account: `0x${string}`, share: number, tokenId: bigint = TOKEN) {
  const state = await position(tokenId, account);
  const liquidity = liquidityFor(state.holdings!.liquidity, share);
  return { state, liquidity, ...(await readRemoval(publicClient, market, tokenId, account, liquidity)) };
}

const ethOf = (address: `0x${string}`) => publicClient.getBalance({ address });

describe("remove liquidity", () => {
  isolateEachTest();

  describe("positive", () => {
    it("a quarter of a position without a loan: the liquidity falls by a quarter, and the wallet gets that principal and every fee", async () => {
      const user = await depositor();
      const { state, liquidity, quote, refusal: refused } = await removalOf(user.address, 25);
      const held = BigInt(await liquidityOf(TOKEN));
      expect(state.holdings!.liquidity).toBe(held);
      expect(liquidity).toBe(held / 4n);
      expect(decreaseLiquidityGate(state, DEFAULT_TOLERANCE_BPS)).toEqual({ ok: true });
      expect(refused).toBeNull();
      expect(quote.principal0).toBeGreaterThan(0n);
      expect(quote.principal1).toBeGreaterThan(0n);
      const { fees0, fees1 } = state.holdings!;
      expect(fees0).toBeGreaterThan(0n);
      expect(fees1).toBeGreaterThan(0n);
      const eth = await ethOf(user.address);
      const nonce = await nonceOf(user.address);
      const steps: string[] = [];

      const receipt = await decreaseLiquidity(
        user.clients,
        blueChip,
        TOKEN,
        { liquidity, ...minimumsFor(quote, DEFAULT_TOLERANCE_BPS) },
        (step) => steps.push(`${step.name}:${step.phase}`),
      );

      expect(steps).toEqual(["decreaseLiquidity:sign", "decreaseLiquidity:confirm"]);
      expect(await nonceOf(user.address)).toBe(nonce + 1);
      expect(BigInt(await liquidityOf(TOKEN))).toBe(held - liquidity);
      // To the unit of what was shown: the quoted principal and the fees, of each token. ETH/USDG
      // pairs native ETH, so ETH arrives and not WETH; the wallet paid the gas out of the same ETH.
      expect(await usdgBalance(user.address)).toBe(quote.principal1 + fees1);
      const gas = receipt.gasUsed * receipt.effectiveGasPrice;
      expect((await ethOf(user.address)) + gas - eth).toBe(quote.principal0 + fees0);

      const after = await position(TOKEN, user.address);
      expect(after.place).toBe("collateral");
      expect((await ownerOf(TOKEN)).toLowerCase()).toBe(market.toLowerCase());
      expect(after.holdings).toMatchObject({ liquidity: held - liquidity, fees0: 0n, fees1: 0n });
    });

    it("three quarters of a position with a small loan: the loan still fits what is left", async () => {
      const user = await depositor();
      await borrow(user.clients, blueChip, TOKEN, 50n * USDG);
      const { liquidity, quote, refusal: refused } = await removalOf(user.address, 75);
      expect(refused).toBeNull();

      await decreaseLiquidity(user.clients, blueChip, TOKEN, { liquidity, ...minimumsFor(quote, DEFAULT_TOLERANCE_BPS) });

      const after = await position(TOKEN, user.address);
      expect(after.debt).toBeGreaterThanOrEqual(50n * USDG);
      expect(after.risk!.healthFactor).toBeGreaterThan(WAD);
      expect(after.risk!.maxBorrow).toBeGreaterThan(0n);
    });
  });

  describe("negative", () => {
    it("past the borrow limit of what is left: refused in simulation, with what to do, and nothing is sent", async () => {
      const user = await depositor();
      const { risk } = await position(TOKEN, user.address);
      await borrow(user.clients, blueChip, TOKEN, risk!.maxBorrow);
      const { state, liquidity, quote, refusal: refused } = await removalOf(user.address, 25);
      // The gate cannot tell: the market does, in the simulation the quote is read with.
      expect(decreaseLiquidityGate(state, DEFAULT_TOLERANCE_BPS)).toEqual({ ok: true });
      expect(refused?.code).toBe("RemovalExceedsBorrowLimit");
      expect(refused?.message).toMatch(/Remove less, or repay until the loan fits/);
      const held = await liquidityOf(TOKEN);
      const nonce = await nonceOf(user.address);
      const steps: string[] = [];

      const thrown = await refusal(
        decreaseLiquidity(user.clients, blueChip, TOKEN, { liquidity, ...minimumsFor(quote, DEFAULT_TOLERANCE_BPS) }, (step) =>
          steps.push(step.name),
        ),
      );

      expect(thrown.code).toBe("RemovalExceedsBorrowLimit");
      expect(thrown.message).toBe(refused!.message);
      expect(steps, "the wallet was asked to confirm").toEqual([]);
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await liquidityOf(TOKEN)).toBe(held);
    });

    it("leaving less than the pool's minimum: refused, and pointed at a repayment and a withdrawal of the collateral", async () => {
      // The position holds 200 USDG. With the pool's minimum raised to $100, three quarters out leaves $50.
      const user = await depositor(POSITIONS.ethUsdgAboveRange);
      await updateTerms(ETH_USDG.id, { minPositionUsd: 100n * WAD });
      const { liquidity, quote, refusal: refused } = await removalOf(user.address, 75, POSITIONS.ethUsdgAboveRange);
      expect(refused?.code).toBe("PositionBelowMinimum");
      expect(refused?.message).toMatch(/left is worth \$50.*\$100 minimum/);
      expect(refused?.message).toMatch(/Remove less.*repay the loan and withdraw the collateral/);
      const nonce = await nonceOf(user.address);

      const thrown = await refusal(
        decreaseLiquidity(user.clients, blueChip, POSITIONS.ethUsdgAboveRange, { liquidity, ...minimumsFor(quote, DEFAULT_TOLERANCE_BPS) }),
      );

      expect(thrown.code).toBe("PositionBelowMinimum");
      expect(thrown.message).toBe(refused!.message);
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      // A quarter out leaves $150, which the same pool takes.
      expect((await removalOf(user.address, 25, POSITIONS.ethUsdgAboveRange)).refusal).toBeNull();
    });

    it("refuses someone removing the liquidity of a position that is not theirs, and quotes them nothing", async () => {
      const owner = await depositor();
      const stranger = await newUser("stranger");
      const state = await position(TOKEN, stranger.address);
      expect(decreaseLiquidityGate(state, DEFAULT_TOLERANCE_BPS)).toMatchObject({ ok: false, code: "NotTheDepositor" });
      const liquidity = liquidityFor(BigInt(await liquidityOf(TOKEN)), 25);

      const unquoted = await refusal(readRemoval(publicClient, market, TOKEN, stranger.address, liquidity));
      const thrown = await refusal(decreaseLiquidity(stranger.clients, blueChip, TOKEN, { liquidity, min0: 0n, min1: 0n }));

      expect(unquoted.code).toBe("NotTheDepositor");
      expect(thrown.code).toBe("NotTheDepositor");
      expect(thrown.message).toMatch(/remove its liquidity/);
      expect((await position(TOKEN, owner.address)).holdings!.liquidity).toBe(BigInt(await liquidityOf(TOKEN)));
    });
  });

  describe("edge case", () => {
    it("the minimums are held against the principal alone: the fees that leave with it do not help meet them", async () => {
      const user = await depositor();
      const { state, liquidity, quote } = await removalOf(user.address, 25);
      // More fees than the one unit the minimum is raised by below.
      expect(state.holdings!.fees0).toBeGreaterThan(1n);
      expect(state.holdings!.fees1).toBeGreaterThan(1n);
      const exact = minimumsFor(quote, 0);
      expect(exact).toEqual({ min0: quote.principal0, min1: quote.principal1 });
      const nonce = await nonceOf(user.address);

      // One unit above the principal of either token is refused, although principal and fees
      // together pay more than that.
      for (const over of [{ ...exact, min0: exact.min0 + 1n }, { ...exact, min1: exact.min1 + 1n }]) {
        const thrown = await refusal(decreaseLiquidity(user.clients, blueChip, TOKEN, { liquidity, ...over }));
        expect(thrown.code).toBe("MinimumAmountInsufficient");
      }
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);

      // The principal exactly is accepted.
      await decreaseLiquidity(user.clients, blueChip, TOKEN, { liquidity, ...exact });
      expect(await usdgBalance(user.address)).toBe(quote.principal1 + state.holdings!.fees1);
    });

    it("a price that moved past the minimums sends nothing; a new quote at the same tolerance goes through", async () => {
      const user = await depositor();
      const { liquidity, quote } = await removalOf(user.address, 25);
      const quoted = minimumsFor(quote, DEFAULT_TOLERANCE_BPS);

      // 1.5% up: the position now holds less ETH and more USDG than it was quoted for.
      await movePoolPrice(ETH_USDG.id, 150);
      const nonce = await nonceOf(user.address);
      const steps: string[] = [];
      const thrown = await refusal(
        decreaseLiquidity(user.clients, blueChip, TOKEN, { liquidity, ...quoted }, (step) => steps.push(step.name)),
      );

      expect(thrown.code).toBe("MinimumAmountInsufficient");
      expect(thrown.message).toMatch(/price moved.*Get a new quote/);
      expect(steps, "the wallet was asked to confirm").toEqual([]);
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);

      const again = await removalOf(user.address, 25);
      expect(again.liquidity).toBe(liquidity);
      expect(again.quote.principal0).toBeLessThan(quoted.min0);
      expect(again.quote.principal1).toBeGreaterThan(quote.principal1);
      // The tolerance is the one the user set. Only the quote is new.
      await decreaseLiquidity(user.clients, blueChip, TOKEN, { liquidity, ...minimumsFor(again.quote, DEFAULT_TOLERANCE_BPS) });
      expect(await usdgBalance(user.address)).toBeGreaterThanOrEqual(again.quote.principal1);
    });

    it("a position out of its range pays one token only, and is quoted none of the other", async () => {
      const user = await depositor(POSITIONS.ethUsdgAboveRange);
      const { liquidity, quote, refusal: refused } = await removalOf(user.address, 50, POSITIONS.ethUsdgAboveRange);
      expect(refused).toBeNull();
      expect(quote.principal0).toBe(0n);
      // Half of the 200 USDG it holds, to within a unit.
      expect(quote.principal1).toBeGreaterThan(99n * USDG);
      expect(quote.principal1).toBeLessThanOrEqual(100n * USDG);
      const { fees1 } = (await position(POSITIONS.ethUsdgAboveRange, user.address)).holdings!;

      await decreaseLiquidity(user.clients, blueChip, POSITIONS.ethUsdgAboveRange, { liquidity, ...minimumsFor(quote, DEFAULT_TOLERANCE_BPS) });

      expect(await usdgBalance(user.address)).toBe(quote.principal1 + fees1);
    });

    it("can be done again on what is left", async () => {
      const user = await depositor();
      const first = await removalOf(user.address, 50);
      await decreaseLiquidity(user.clients, blueChip, TOKEN, { liquidity: first.liquidity, ...minimumsFor(first.quote, DEFAULT_TOLERANCE_BPS) });

      const second = await removalOf(user.address, 50);
      await decreaseLiquidity(user.clients, blueChip, TOKEN, { liquidity: second.liquidity, ...minimumsFor(second.quote, DEFAULT_TOLERANCE_BPS) });

      const held = first.state.holdings!.liquidity;
      expect(second.liquidity).toBe((held - first.liquidity) / 2n);
      expect(BigInt(await liquidityOf(TOKEN))).toBe(held - first.liquidity - second.liquidity);
    });
  });
});
