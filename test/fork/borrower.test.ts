import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";

import {
  borrow,
  depositCollateral,
  repay,
  repayAllowance,
  supply,
  withdrawCollateral,
} from "@/lib/onchain/actions";
import { ActionError } from "@/lib/onchain/errors";
import {
  borrowGate,
  depositCollateralGate,
  repayGate,
  withdrawCollateralGate,
} from "@/lib/onchain/gates";
import { readPosition } from "@/lib/onchain/reads";
import { MIN_DEBT_USDG } from "@/lib/units";

import { ETH_USDG, POSITIONS, WETH_USDG } from "./support/constants";
import {
  blueChip,
  dealUsdg,
  debtOf,
  givePosition,
  isolateEachTest,
  newUser,
  nonceOf,
  ownerOf,
  publicClient,
  usdgAllowance,
  usdgBalance,
  wait,
} from "./support/fork";

const USDG = 1_000_000n;
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

/** A lender's USDG in the market, so there is something to borrow. */
async function fundMarket(amount = 50_000n * USDG) {
  const lender = await newUser("funding-lender");
  await dealUsdg(lender.address, amount);
  await supply(lender.clients, blueChip, amount);
}

/** A borrower holding `tokenId` in their wallet. */
async function borrowerWith(tokenId: bigint, label = "borrower") {
  const user = await newUser(label);
  await givePosition(user.address, tokenId);
  return user;
}

/** A borrower whose `tokenId` is deposited, in a market with cash. */
async function depositedBorrower(tokenId = TOKEN) {
  await fundMarket();
  const user = await borrowerWith(tokenId);
  await depositCollateral(user.clients, blueChip, tokenId);
  return user;
}

const position = (tokenId: bigint, account: `0x${string}`) => readPosition(publicClient, blueChip, tokenId, account);

describe("deposit collateral", () => {
  isolateEachTest();

  describe("positive", () => {
    it("moves the NFT to the market in one transaction, and the position shows up to borrow against", async () => {
      const user = await borrowerWith(TOKEN);
      const before = await position(TOKEN, user.address);
      expect(before.place).toBe("wallet");
      expect(before.poolId).toBe(ETH_USDG.id);
      expect(depositCollateralGate(before, ETH_USDG.id)).toEqual({ ok: true });
      const nonce = await nonceOf(user.address);
      const steps: string[] = [];

      await depositCollateral(user.clients, blueChip, TOKEN, (step) => steps.push(`${step.name}:${step.phase}`));

      expect((await ownerOf(TOKEN)).toLowerCase()).toBe(market.toLowerCase());
      // The permit is a signature, not a transaction: one nonce spent.
      expect(await nonceOf(user.address)).toBe(nonce + 1);
      expect(steps).toEqual(["permit:sign", "depositCollateral:sign", "depositCollateral:confirm"]);

      const after = await position(TOKEN, user.address);
      expect(after.place).toBe("collateral");
      expect(after.debt).toBe(0n);
      expect(after.risk?.healthFactor).toBe(maxUint256);
      // Above the listing's $50 minimum, or the deposit would have been refused.
      expect(after.risk!.positionValue).toBeGreaterThan(50n * 10n ** 18n);
      // maxBorrow is 65% of the value (the listing's max LTV), in USDG at the oracle's price,
      // and the market only lends while that price is within $0.97 to $1.03.
      const atMaxLtv = (after.risk!.positionValue * 6500n) / 10_000n / 10n ** 12n;
      expect(after.risk!.maxBorrow).toBeGreaterThanOrEqual((atMaxLtv * 100n) / 103n);
      expect(after.risk!.maxBorrow).toBeLessThanOrEqual((atMaxLtv * 100n) / 97n);
      expect(after.pool).toEqual({ status: "open", terms: { maxLtvBps: 6500, ltBps: 7500 } });
    });

    it("takes a position from the other listed pool, where both tokens are ERC-20", async () => {
      const user = await borrowerWith(POSITIONS.wethUsdgInRange);

      await depositCollateral(user.clients, blueChip, POSITIONS.wethUsdgInRange);

      const after = await position(POSITIONS.wethUsdgInRange, user.address);
      expect(after.place).toBe("collateral");
      expect(after.poolId).toBe(WETH_USDG.id);
    });
  });

  describe("negative", () => {
    it("refuses a position from a pool that is not listed, and the NFT stays in the wallet", async () => {
      const user = await borrowerWith(POSITIONS.unlistedPool);
      const state = await position(POSITIONS.unlistedPool, user.address);
      expect(state.pool.status).toBe("unlisted");
      expect(depositCollateralGate(state)).toMatchObject({ ok: false, code: "PoolNotListed" });
      const nonce = await nonceOf(user.address);

      const steps: string[] = [];
      const refused = await refusal(
        depositCollateral(user.clients, blueChip, POSITIONS.unlistedPool, (step) => steps.push(step.name)),
      );

      expect(refused.code).toBe("PoolNotListed");
      expect(steps, "a signature was asked for").toEqual([]);
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await ownerOf(POSITIONS.unlistedPool)).toBe(user.address);
    });

    it("refuses someone who does not own the position before asking them for a signature", async () => {
      const owner = await borrowerWith(TOKEN);
      const stranger = await newUser("stranger");
      const steps: string[] = [];

      const refused = await refusal(
        depositCollateral(stranger.clients, blueChip, TOKEN, (step) => steps.push(step.name)),
      );

      expect(refused.code).toBe("NotTheOwner");
      expect(steps).toEqual([]);
      expect(await ownerOf(TOKEN)).toBe(owner.address);
    });
  });

  describe("edge case", () => {
    it("takes a position that is out of range and holds only USDG", async () => {
      const user = await borrowerWith(POSITIONS.ethUsdgAboveRange);

      await depositCollateral(user.clients, blueChip, POSITIONS.ethUsdgAboveRange);

      expect((await position(POSITIONS.ethUsdgAboveRange, user.address)).place).toBe("collateral");
    });

    it("reports a token that does not exist as missing instead of failing the read", async () => {
      const user = await newUser("borrower");
      const state = await position(2n ** 200n, user.address);

      expect(state.place).toBe("missing");
      expect(depositCollateralGate(state)).toMatchObject({ ok: false, code: "PositionNotFound" });
    });

    it("refuses a position on the page of another pool", async () => {
      const user = await borrowerWith(TOKEN);

      expect(depositCollateralGate(await position(TOKEN, user.address), WETH_USDG.id)).toMatchObject({
        ok: false,
        code: "WrongPool",
      });
    });
  });
});

describe("borrow", () => {
  isolateEachTest();

  describe("positive", () => {
    it("pays the USDG to the borrower and records the debt", async () => {
      const user = await depositedBorrower();
      expect(borrowGate(await position(TOKEN, user.address), 50n * USDG)).toEqual({ ok: true });

      await borrow(user.clients, blueChip, TOKEN, 50n * USDG);

      expect(await usdgBalance(user.address)).toBe(50n * USDG);
      const after = await position(TOKEN, user.address);
      expect(after.debt).toBeGreaterThanOrEqual(50n * USDG);
      expect(after.debt).toBeLessThan(50n * USDG + 1_000n);
      expect(after.risk!.healthFactor).toBeGreaterThan(10n ** 18n);
      expect(after.risk!.healthFactor).toBeLessThan(maxUint256);
    });
  });

  describe("negative", () => {
    it("above maxBorrow is refused in simulation and no transaction is sent", async () => {
      const user = await depositedBorrower();
      const state = await position(TOKEN, user.address);
      const tooMuch = state.risk!.maxBorrow + 1n * USDG;
      expect(borrowGate(state, tooMuch)).toMatchObject({ ok: false, code: "BorrowExceedsMaxLtv" });
      const nonce = await nonceOf(user.address);

      const refused = await refusal(borrow(user.clients, blueChip, TOKEN, tooMuch));

      expect(refused.code).toBe("BorrowExceedsMaxLtv");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await debtOf(market, TOKEN)).toBe(0n);
      expect(await usdgBalance(user.address)).toBe(0n);
    });

    it("a loan that would owe less than 10 USDG is refused with the minimum in the message", async () => {
      const user = await depositedBorrower();
      const state = await position(TOKEN, user.address);
      const gate = borrowGate(state, MIN_DEBT_USDG - 1n);
      expect(gate).toMatchObject({ ok: false, code: "BorrowBelowMinimum" });
      expect(gate.ok === false && gate.message).toMatch(/at least 10 USDG/);
      const nonce = await nonceOf(user.address);

      const refused = await refusal(borrow(user.clients, blueChip, TOKEN, MIN_DEBT_USDG - 1n));

      expect(refused.code).toBe("BorrowBelowMinimum");
      expect(refused.message).toMatch(/at least 10 USDG/);
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await debtOf(market, TOKEN)).toBe(0n);
    });

    it("refuses someone borrowing against a position that is not theirs", async () => {
      await depositedBorrower();
      const stranger = await newUser("stranger");
      expect(borrowGate(await position(TOKEN, stranger.address), 50n * USDG)).toMatchObject({
        ok: false,
        code: "NotTheDepositor",
      });

      expect((await refusal(borrow(stranger.clients, blueChip, TOKEN, 50n * USDG))).code).toBe("BorrowerNotAuthorized");
    });
  });

  describe("edge case", () => {
    it("the whole of maxBorrow, as the Max button reads it from the lens, goes through", async () => {
      const user = await depositedBorrower();
      const { risk } = await position(TOKEN, user.address);

      await borrow(user.clients, blueChip, TOKEN, risk!.maxBorrow);

      expect(await usdgBalance(user.address)).toBe(risk!.maxBorrow);
      const after = await position(TOKEN, user.address);
      expect(after.risk!.maxBorrow).toBeLessThan(USDG);
      expect(borrowGate(after, USDG)).toMatchObject({ ok: false, code: "BorrowExceedsMaxLtv" });
    });

    it("exactly 10 USDG is a loan", async () => {
      const user = await depositedBorrower();

      await borrow(user.clients, blueChip, TOKEN, MIN_DEBT_USDG);

      expect(await debtOf(market, TOKEN)).toBeGreaterThanOrEqual(MIN_DEBT_USDG);
    });

    it("a small top-up is held to the minimum on the total, not on the amount", async () => {
      const user = await depositedBorrower();
      await borrow(user.clients, blueChip, TOKEN, 50n * USDG);

      await borrow(user.clients, blueChip, TOKEN, 1n * USDG);

      expect(await usdgBalance(user.address)).toBe(51n * USDG);
    });
  });
});

describe("repay and withdraw collateral", () => {
  isolateEachTest();

  describe("positive", () => {
    it("a full repayment brings the debt to zero, and the collateral can then be withdrawn", async () => {
      const user = await depositedBorrower();
      await borrow(user.clients, blueChip, TOKEN, 100n * USDG);
      await wait(30 * 24 * 60 * 60);
      // Interest for the month, which the borrowed 100 USDG does not cover.
      await dealUsdg(user.address, 110n * USDG);
      const owed = (await position(TOKEN, user.address)).debt;
      expect(owed).toBeGreaterThan(100n * USDG);

      await repay(user.clients, blueChip, TOKEN, "max");

      expect(await debtOf(market, TOKEN)).toBe(0n);
      const repaid = 110n * USDG - (await usdgBalance(user.address));
      expect(repaid).toBeGreaterThanOrEqual(owed);
      expect(repaid).toBeLessThanOrEqual(repayAllowance(owed));

      const cleared = await position(TOKEN, user.address);
      expect(withdrawCollateralGate(cleared)).toEqual({ ok: true });
      await withdrawCollateral(user.clients, blueChip, TOKEN);

      expect(await ownerOf(TOKEN)).toBe(user.address);
      expect((await position(TOKEN, user.address)).place).toBe("wallet");
    });

    it("a partial repayment takes that much off the debt", async () => {
      const user = await depositedBorrower();
      await borrow(user.clients, blueChip, TOKEN, 100n * USDG);
      const owed = (await position(TOKEN, user.address)).debt;

      await repay(user.clients, blueChip, TOKEN, 40n * USDG);

      // `repay` pulls what the repaid shares are worth, which rounds to within a unit of 40 USDG.
      const paid = 100n * USDG - (await usdgBalance(user.address));
      expect(paid).toBeGreaterThanOrEqual(40n * USDG - 1n);
      expect(paid).toBeLessThanOrEqual(40n * USDG);
      const left = await debtOf(market, TOKEN);
      expect(left).toBeGreaterThanOrEqual(owed - 40n * USDG);
      expect(left).toBeLessThan(owed - 40n * USDG + 1_000n);
    });
  });

  describe("negative", () => {
    it("collateral with debt against it cannot be withdrawn: the gate is shut and nothing is sent", async () => {
      const user = await depositedBorrower();
      await borrow(user.clients, blueChip, TOKEN, 50n * USDG);
      expect(withdrawCollateralGate(await position(TOKEN, user.address))).toMatchObject({
        ok: false,
        code: "OutstandingDebt",
      });
      const nonce = await nonceOf(user.address);

      const refused = await refusal(withdrawCollateral(user.clients, blueChip, TOKEN));

      expect(refused.code).toBe("OutstandingDebt");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect((await ownerOf(TOKEN)).toLowerCase()).toBe(market.toLowerCase());
    });

    it("a repayment the wallet cannot pay for sends nothing, not even the approval", async () => {
      const user = await depositedBorrower();
      await borrow(user.clients, blueChip, TOKEN, 100n * USDG);
      await dealUsdg(user.address, 20n * USDG);
      expect(repayGate(await position(TOKEN, user.address), "max")).toMatchObject({
        ok: false,
        code: "InsufficientBalance",
      });
      const nonce = await nonceOf(user.address);

      const refused = await refusal(repay(user.clients, blueChip, TOKEN, "max"));

      expect(refused.code).toBe("InsufficientBalance");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await usdgAllowance(user.address, market)).toBe(0n);
    });

    it("someone else cannot withdraw the collateral", async () => {
      await depositedBorrower();
      const stranger = await newUser("stranger");

      expect((await refusal(withdrawCollateral(stranger.clients, blueChip, TOKEN))).code).toBe("NotTheDepositor");
    });
  });

  describe("edge case", () => {
    it("the approval for a full repayment is the debt plus a cushion, never unlimited", async () => {
      const user = await depositedBorrower();
      await borrow(user.clients, blueChip, TOKEN, 100n * USDG);
      await dealUsdg(user.address, 101n * USDG);
      const owed = (await position(TOKEN, user.address)).debt;

      await repay(user.clients, blueChip, TOKEN, "max");

      const left = await usdgAllowance(user.address, market);
      expect(left).toBeLessThanOrEqual(repayAllowance(owed) - owed);
      expect(left).toBeLessThan(USDG);
    });

    it("reads the debt with the interest since the market's last transaction, which debtOf leaves out", async () => {
      const user = await depositedBorrower();
      await borrow(user.clients, blueChip, TOKEN, 100n * USDG);
      await wait(30 * 24 * 60 * 60);

      const stored = await debtOf(market, TOKEN);
      const { debt } = await position(TOKEN, user.address);

      expect(debt).toBeGreaterThan(stored);
      // Blue-chip borrow rate at a utilisation this low is well under 10% a year.
      expect(debt - stored).toBeLessThan((100n * USDG * 10n) / 100n / 12n);
    });

    it("an amount above the debt repays the debt and no more", async () => {
      const user = await depositedBorrower();
      await borrow(user.clients, blueChip, TOKEN, 100n * USDG);
      await dealUsdg(user.address, 500n * USDG);

      await repay(user.clients, blueChip, TOKEN, 400n * USDG);

      expect(await debtOf(market, TOKEN)).toBe(0n);
      expect(await usdgBalance(user.address)).toBeGreaterThan(399n * USDG);
    });
  });
});
