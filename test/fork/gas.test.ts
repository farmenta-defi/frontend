import { erc20Abi, maxUint256, type Abi, type Address } from "viem";
import { describe, expect, it } from "vitest";

import {
  ACCRUAL_GAS,
  borrow,
  depositCollateral,
  gasLimitFor,
  repay,
  supply,
  withdraw,
  withdrawCollateral,
} from "@/lib/onchain/actions";
import { marketAbi } from "@/lib/onchain/contracts";
import { signCollateralPermit } from "@/lib/onchain/permit";
import type { Clients } from "@/lib/onchain/reads";

import { POSITIONS, USDG as USDG_TOKEN } from "./support/constants";
import { anvil, blueChip, dealUsdg, givePosition, isolateEachTest, newUser, publicClient } from "./support/fork";

/**
 * The gas limit an action is sent with, in the one situation where the
 * estimate is short: it is taken in the second of the market's last accrual,
 * where the accrual inside the call returns at once, and the transaction is
 * mined later, where the accrual writes.
 *
 * anvil estimates on the block it is about to mine, where time has already
 * passed, so the situation is built by hand: `accrue()` is mined, the estimate
 * is taken at that block, and the call is mined an hour later with the limit
 * the app computes from that estimate.
 */
const USDG = 1_000_000n;
const HOUR = 3_600n;
const { market } = blueChip;
const LOAN = POSITIONS.ethUsdgInRange;
const SPARE = POSITIONS.ethUsdgAboveRange;
const FRESH = POSITIONS.wethUsdgInRange;

type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

/** A market with a lender, a loan that accrues, collateral without a loan, and a position to deposit. */
async function marketWithALoan() {
  const lender = await newUser("lender");
  await dealUsdg(lender.address, 10_000n * USDG);
  await supply(lender.clients, blueChip, 5_000n * USDG);

  const borrower = await newUser("borrower");
  for (const tokenId of [LOAN, SPARE, FRESH]) await givePosition(borrower.address, tokenId);
  await depositCollateral(borrower.clients, blueChip, LOAN);
  await depositCollateral(borrower.clients, blueChip, SPARE);
  await borrow(borrower.clients, blueChip, LOAN, 100n * USDG);
  await dealUsdg(borrower.address, 500n * USDG);

  // Approved ahead, so the calls measured below are the calls themselves.
  for (const { clients } of [lender, borrower]) {
    const hash = await clients.walletClient.writeContract({
      address: USDG_TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [market, 1_000n * USDG],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }
  return { lender, borrower };
}

/**
 * Estimates `call` in the second of an accrual and mines it `after` seconds
 * later with `limitFor(estimate)`. Returns what was estimated and what was used.
 *
 * The loan in `marketWithALoan` has not accrued with time passed before, so
 * the accrual mined here is the market's first: the dearest one, which writes
 * the reserves from zero.
 */
async function sentAfterAnAccrual({ walletClient }: Clients, call: Call, limitFor = gasLimitFor, after = HOUR) {
  const accrued = await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({ address: market, abi: marketAbi, functionName: "accrue" }),
  });
  const estimate = await publicClient.estimateContractGas({
    ...call,
    account: walletClient.account,
    blockNumber: accrued.blockNumber,
  });

  const { timestamp } = await publicClient.getBlock({ blockNumber: accrued.blockNumber });
  await anvil.setNextBlockTimestamp({ timestamp: timestamp + after });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({ ...call, gas: limitFor(estimate) }),
  });
  return { estimate, used: receipt.gasUsed, status: receipt.status };
}

/**
 * The same situation around one of the app's own actions: the clients it is
 * given estimate at the block of the accrual mined just before, and mine what
 * they send an hour later. Records the estimate the action got and the gas
 * limit it sent with.
 */
async function inTheSecondOfAnAccrual({ publicClient: reads, walletClient }: Clients) {
  const accrued = await reads.waitForTransactionReceipt({
    hash: await walletClient.writeContract({ address: market, abi: marketAbi, functionName: "accrue" }),
  });
  const { timestamp } = await reads.getBlock({ blockNumber: accrued.blockNumber });
  const seen: { estimate?: bigint; gas?: bigint } = {};

  const clients = {
    publicClient: {
      ...reads,
      estimateContractGas: async (args: Parameters<typeof reads.estimateContractGas>[0]) => {
        seen.estimate = await reads.estimateContractGas({ ...args, blockNumber: accrued.blockNumber } as never);
        return seen.estimate;
      },
    },
    walletClient: {
      ...walletClient,
      writeContract: async (args: Parameters<typeof walletClient.writeContract>[0]) => {
        seen.gas = (args as { gas?: bigint }).gas;
        await anvil.setNextBlockTimestamp({ timestamp: timestamp + HOUR });
        return walletClient.writeContract(args);
      },
    },
  } as unknown as Clients;
  return { clients, seen };
}

const call = (functionName: string, args: readonly unknown[]): Call => ({
  address: market,
  abi: marketAbi as Abi,
  functionName,
  args,
});

describe("the gas limit, when the estimate was taken in the second of an accrual", () => {
  isolateEachTest();

  describe("positive", () => {
    it("supply, withdraw, borrow and repay are mined and succeed", async () => {
      const { lender, borrower } = await marketWithALoan();
      const calls: [string, Clients, Call][] = [
        ["supply", lender.clients, call("deposit", [200n * USDG, lender.address])],
        ["withdraw", lender.clients, call("withdraw", [200n * USDG, lender.address, lender.address])],
        ["borrow", borrower.clients, call("borrow", [LOAN, 50n * USDG, borrower.address])],
        ["repay", borrower.clients, call("repay", [LOAN, maxUint256])],
      ];

      for (const [name, clients, sent] of calls) {
        const { estimate, used, status } = await sentAfterAnAccrual(clients, sent);

        expect(status, `${name} ran out of gas`).toBe("success");
        // The situation is the one meant: the accrual made the call cost more than was estimated...
        expect(used, `${name} did not accrue`).toBeGreaterThan(estimate);
        // ...by less than the allowance made for it.
        expect(used - estimate, `${name}: the accrual cost more than ACCRUAL_GAS`).toBeLessThan(ACCRUAL_GAS);
      }
    });

    it("the app's own actions send with that limit, and are mined", async () => {
      const { lender, borrower } = await marketWithALoan();
      const actions: [string, Clients, (clients: Clients) => Promise<{ status: string; gasUsed: bigint }>][] = [
        ["supply", lender.clients, (clients) => supply(clients, blueChip, 200n * USDG)],
        ["withdraw", lender.clients, (clients) => withdraw(clients, blueChip, 200n * USDG)],
        ["borrow", borrower.clients, (clients) => borrow(clients, blueChip, LOAN, 50n * USDG)],
        // Before the repayment: with no loan left in the market an accrual has nothing to write.
        ["withdrawCollateral", borrower.clients, (clients) => withdrawCollateral(clients, blueChip, SPARE)],
        ["repay", borrower.clients, (clients) => repay(clients, blueChip, LOAN, "max")],
      ];

      for (const [name, real, action] of actions) {
        const { clients, seen } = await inTheSecondOfAnAccrual(real);

        const receipt = await action(clients);

        expect(receipt.status, `${name} ran out of gas`).toBe("success");
        expect(seen.estimate, `${name} was not estimated`).toBeGreaterThan(0n);
        expect(seen.gas, `${name} was not sent with the limit`).toBe(gasLimitFor(seen.estimate!));
        expect(receipt.gasUsed, `${name} did not accrue`).toBeGreaterThan(seen.estimate!);
      }
    });

    it("withdrawing collateral, which accrues too, is mined and succeeds", async () => {
      const { borrower } = await marketWithALoan();

      const { estimate, used, status } = await sentAfterAnAccrual(
        borrower.clients,
        call("withdrawCollateral", [SPARE, borrower.address]),
      );

      expect(status).toBe("success");
      expect(used).toBeGreaterThan(estimate);
      expect(used - estimate).toBeLessThan(ACCRUAL_GAS);
    });
  });

  describe("negative", () => {
    it("the bare estimate runs out of gas on supply and on withdraw, which is what the limit is for", async () => {
      const { lender } = await marketWithALoan();
      const bare = (estimate: bigint) => estimate;

      for (const sent of [
        call("deposit", [200n * USDG, lender.address]),
        call("withdraw", [200n * USDG, lender.address, lender.address]),
      ]) {
        const { status } = await sentAfterAnAccrual(lender.clients, sent, bare);
        expect(status, sent.functionName).toBe("reverted");
      }
    });

    it("a quarter more, the margin this replaces, runs out on supply and on withdraw too", async () => {
      const { lender } = await marketWithALoan();
      const quarterMore = (estimate: bigint) => (estimate * 125n) / 100n;

      for (const sent of [
        call("deposit", [200n * USDG, lender.address]),
        call("withdraw", [200n * USDG, lender.address, lender.address]),
      ]) {
        const { status } = await sentAfterAnAccrual(lender.clients, sent, quarterMore);
        expect(status, sent.functionName).toBe("reverted");
      }
    });
  });

  describe("edge case", () => {
    it("a collateral deposit is mined and succeeds with the same limit", async () => {
      const { borrower } = await marketWithALoan();
      const permit = await signCollateralPermit(borrower.clients, market, FRESH);

      // A minute later, not an hour: the permit is valid for thirty minutes.
      const { status } = await sentAfterAnAccrual(
        borrower.clients,
        call("depositCollateralWithPermit", [FRESH, permit.deadline, permit.nonce, permit.signature]),
        gasLimitFor,
        60n,
      );

      expect(status).toBe("success");
    });

    it("the limit is the estimate, a tenth, and the allowance", () => {
      expect(gasLimitFor(100_000n)).toBe(210_000n);
      expect(gasLimitFor(0n)).toBe(ACCRUAL_GAS);
      // The supply the review measured: estimate 95,646, used 119,152 with the accrual.
      expect(gasLimitFor(95_646n)).toBeGreaterThan(119_152n);
    });
  });
});
