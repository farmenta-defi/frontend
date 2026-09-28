import { describe, expect, it } from "vitest";

import { supply, withdraw } from "@/lib/onchain/actions";
import { ActionError } from "@/lib/onchain/errors";
import { supplyGate, withdrawGate } from "@/lib/onchain/gates";
import { readLenderState } from "@/lib/onchain/reads";

import {
  approveUsdg,
  blueChip,
  dealUsdg,
  isolateEachTest,
  newUser,
  nonceOf,
  publicClient,
  sharesOf,
  totalAssets,
  usdgAllowance,
  usdgBalance,
} from "./support/fork";

const USDG = 1_000_000n;
const { market } = blueChip;

/** Runs `action`, which has to be refused, and returns the refusal. */
async function refusal(action: Promise<unknown>) {
  const error = await action.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error, "the action went through").toBeInstanceOf(ActionError);
  return error as ActionError;
}

describe("supply", () => {
  isolateEachTest();

  describe("positive", () => {
    it("supplying 100 USDG mints shares and raises the market's total assets by 100 USDG", async () => {
      const user = await newUser("lender");
      await dealUsdg(user.address, 250n * USDG);
      const assetsBefore = await totalAssets(market);
      expect(await sharesOf(market, user.address)).toBe(0n);

      const receipt = await supply(user.clients, blueChip, 100n * USDG);

      expect(receipt.status).toBe("success");
      expect(await sharesOf(market, user.address)).toBeGreaterThan(0n);
      expect((await totalAssets(market)) - assetsBefore).toBe(100n * USDG);
      expect(await usdgBalance(user.address)).toBe(150n * USDG);

      const state = await readLenderState(publicClient, market, user.address);
      // ERC-4626 rounds a deposit's worth down, by at most one unit.
      expect(state.deposited).toBeGreaterThanOrEqual(100n * USDG - 1n);
      expect(state.deposited).toBeLessThanOrEqual(100n * USDG);
    });

    it("approves the amount supplied and nothing beyond it", async () => {
      const user = await newUser("lender");
      await dealUsdg(user.address, 250n * USDG);
      const steps: string[] = [];

      await supply(user.clients, blueChip, 100n * USDG, (step) => steps.push(`${step.name}:${step.phase}`));

      expect(steps).toEqual(["approve:sign", "approve:confirm", "supply:sign", "supply:confirm"]);
      // The deposit spent all of it: no allowance is left standing.
      expect(await usdgAllowance(user.address, market)).toBe(0n);
    });
  });

  describe("negative", () => {
    it("the gate refuses more than the wallet holds, from the balance read on chain", async () => {
      const user = await newUser("lender");
      await dealUsdg(user.address, 40n * USDG);
      const state = await readLenderState(publicClient, market, user.address);

      expect(supplyGate(state, 40n * USDG)).toEqual({ ok: true });
      expect(supplyGate(state, 40n * USDG + 1n)).toMatchObject({ ok: false, code: "InsufficientBalance" });
    });

    it("a supply the wallet cannot pay for sends nothing, not even the approval", async () => {
      const user = await newUser("lender");
      await dealUsdg(user.address, 40n * USDG);
      const assetsBefore = await totalAssets(market);
      const nonce = await nonceOf(user.address);

      const refused = await refusal(supply(user.clients, blueChip, 100n * USDG));

      expect(refused.code).toBe("InsufficientBalance");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await usdgAllowance(user.address, market)).toBe(0n);
      expect(await sharesOf(market, user.address)).toBe(0n);
      expect(await totalAssets(market)).toBe(assetsBefore);
    });
  });

  describe("edge case", () => {
    it("does not approve again when the wallet already approved enough", async () => {
      const user = await newUser("lender");
      await dealUsdg(user.address, 250n * USDG);
      await approveUsdg(user.clients, market, 120n * USDG);
      const steps: string[] = [];

      await supply(user.clients, blueChip, 100n * USDG, (step) => steps.push(step.name));

      expect(steps).toEqual(["supply", "supply"]);
      expect(await usdgAllowance(user.address, market)).toBe(20n * USDG);
    });

    it("approves again for a second supply, because the first left no allowance behind", async () => {
      const user = await newUser("lender");
      await dealUsdg(user.address, 250n * USDG);
      await supply(user.clients, blueChip, 100n * USDG);
      const steps: string[] = [];

      await supply(user.clients, blueChip, 50n * USDG, (step) => steps.push(step.name));

      expect(steps).toEqual(["approve", "approve", "supply", "supply"]);
      expect((await readLenderState(publicClient, market, user.address)).allowance).toBe(0n);
    });

    it("the gate refuses an empty or a zero amount before anything is read for it", async () => {
      const user = await newUser("lender");
      const state = await readLenderState(publicClient, market, user.address);

      expect(supplyGate(state, null)).toMatchObject({ ok: false, code: "NoAmount" });
      expect(supplyGate(state, 0n)).toMatchObject({ ok: false, code: "NoAmount" });
    });
  });
});

describe("withdraw", () => {
  isolateEachTest();

  describe("positive", () => {
    it("returns the USDG and burns the shares", async () => {
      const user = await newUser("lender");
      await dealUsdg(user.address, 100n * USDG);
      await supply(user.clients, blueChip, 100n * USDG);
      const { maxWithdraw } = await readLenderState(publicClient, market, user.address);

      await withdraw(user.clients, blueChip, maxWithdraw);

      expect(await usdgBalance(user.address)).toBe(maxWithdraw);
      expect((await readLenderState(publicClient, market, user.address)).maxWithdraw).toBe(0n);
    });
  });

  describe("negative", () => {
    it("the gate refuses above maxWithdraw and names the limit read from chain", async () => {
      const user = await newUser("lender");
      await dealUsdg(user.address, 100n * USDG);
      await supply(user.clients, blueChip, 100n * USDG);
      const state = await readLenderState(publicClient, market, user.address);
      const nonce = await nonceOf(user.address);

      const gate = withdrawGate(state, state.maxWithdraw + 1n);

      expect(gate).toMatchObject({ ok: false, code: "ERC4626ExceededMaxWithdraw" });
      expect(gate.ok === false && gate.message).toContain(
        `${(Number(state.maxWithdraw) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDG`,
      );
      expect(withdrawGate(state, state.maxWithdraw)).toEqual({ ok: true });
      expect(await nonceOf(user.address)).toBe(nonce);
    });

    it("a withdrawal above maxWithdraw is refused in simulation with the contract's own error", async () => {
      const user = await newUser("lender");
      await dealUsdg(user.address, 100n * USDG);
      await supply(user.clients, blueChip, 100n * USDG);
      const { maxWithdraw } = await readLenderState(publicClient, market, user.address);
      const nonce = await nonceOf(user.address);

      const refused = await refusal(withdraw(user.clients, blueChip, maxWithdraw + 1n));

      expect(refused.code).toBe("ERC4626ExceededMaxWithdraw");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
    });
  });

  describe("edge case", () => {
    it("a wallet that supplied nothing can withdraw nothing", async () => {
      const user = await newUser("stranger");
      const state = await readLenderState(publicClient, market, user.address);

      expect(state.maxWithdraw).toBe(0n);
      expect(withdrawGate(state, 1n)).toMatchObject({ ok: false, code: "ERC4626ExceededMaxWithdraw" });
      expect((await refusal(withdraw(user.clients, blueChip, 1n))).code).toBe("ERC4626ExceededMaxWithdraw");
    });
  });
});
