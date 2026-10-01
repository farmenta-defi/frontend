import { erc20Abi, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import { borrow, depositCollateral, increaseLiquidity, supply } from "@/lib/onchain/actions";
import { permittedFor, readAddition, signAdditionPermit } from "@/lib/onchain/addition";
import { marketAbi } from "@/lib/onchain/contracts";
import { ActionError, explainAdditionError } from "@/lib/onchain/errors";
import { additionFundsGate, increaseLiquidityGate } from "@/lib/onchain/gates";
import { additionFor } from "@/lib/onchain/liquidity-math";
import { readPosition } from "@/lib/onchain/reads";
import { DEFAULT_TOLERANCE_BPS } from "@/lib/onchain/removal";

import { ETH_USDG, META_USDG, POSITIONS, USDG as USDG_TOKEN } from "./support/constants";
import {
  blueChip,
  deal,
  dealUsdg,
  freeze,
  givePosition,
  isolateEachTest,
  liquidityOf,
  movePoolPrice,
  newUser,
  nonceOf,
  pause,
  publicClient,
  usdgAllowance,
  usdgBalance,
} from "./support/fork";

/**
 * Adding liquidity to a deposited position (FAR-66), on the ETH/USDG pool:
 * native ETH as currency0, sent as the transaction's value, and USDG as
 * currency1, pulled through Permit2. META/USDG stands for a pair of two
 * ERC-20 tokens. The other pools go through the same addition in
 * `pools.test.ts`.
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

/** A borrower whose `tokenId` is deposited, with USDG to add with, in a market with cash. A new wallet holds 10 ETH. */
async function depositor(tokenId: bigint = TOKEN, usdg = 5_000n * USDG) {
  const lender = await newUser("funding-lender");
  await dealUsdg(lender.address, 50_000n * USDG);
  await supply(lender.clients, blueChip, 50_000n * USDG);
  const user = await newUser("borrower");
  await givePosition(user.address, tokenId);
  await depositCollateral(user.clients, blueChip, tokenId);
  await dealUsdg(user.address, usdg);
  return user;
}

const position = (tokenId: bigint, account: `0x${string}`) => readPosition(publicClient, blueChip, tokenId, account);
const ethOf = (address: `0x${string}`) => publicClient.getBalance({ address });

/** What the panel reads and shows for a share of a position: the quote, and the maximums at a tolerance. */
async function additionOf(account: `0x${string}`, share: number, tokenId: bigint = TOKEN, toleranceBps = DEFAULT_TOLERANCE_BPS) {
  const quote = await readAddition(publicClient, market, tokenId, account, { share });
  return { quote, ...additionFor(quote.price, quote.range, quote.liquidity, toleranceBps) };
}

describe("add liquidity", () => {
  isolateEachTest();

  describe("positive", () => {
    it("a quarter more on a position without a loan: the pool takes what was quoted, to the unit, and the rest comes back with the fees", async () => {
      const user = await depositor();
      const state = await position(TOKEN, user.address);
      const { quote, need0, need1, max0, max1 } = await additionOf(user.address, 25);
      const held = BigInt(await liquidityOf(TOKEN));
      expect(increaseLiquidityGate(state)).toEqual({ ok: true });
      expect(quote.liquidity).toBe(held / 4n);
      expect(need0).toBeGreaterThan(0n);
      expect(need1).toBeGreaterThan(0n);
      expect(max0).toBe((need0 * 10_050n + 9_999n) / 10_000n);
      expect(max1).toBe((need1 * 10_050n + 9_999n) / 10_000n);
      expect(additionFundsGate({ max0, max1, ...quote }, ["ETH", "USDG"])).toEqual({ ok: true });
      const { fees0, fees1 } = state.holdings!;
      const eth = await ethOf(user.address);
      const usdg = await usdgBalance(user.address);
      const steps: string[] = [];
      let gas = 0n;

      const receipt = await increaseLiquidity(
        {
          ...user.clients,
          // The approval's gas is paid in the same ETH the addition is.
          publicClient: {
            ...user.clients.publicClient,
            waitForTransactionReceipt: async (args: { hash: `0x${string}` }) => {
              const mined = await publicClient.waitForTransactionReceipt(args);
              gas += mined.gasUsed * mined.effectiveGasPrice;
              return mined;
            },
          } as never,
        },
        blueChip,
        TOKEN,
        { liquidity: quote.liquidity, max0, max1 },
        (step) => steps.push(`${step.name}:${step.phase}`),
      );

      expect(receipt.status).toBe("success");
      // One approval, for USDG: the ETH is the transaction's value. Then the permit, then the call.
      expect(steps).toEqual([
        "approveAddition:sign",
        "approveAddition:confirm",
        "permitAddition:sign",
        "increaseLiquidity:sign",
        "increaseLiquidity:confirm",
      ]);
      expect(BigInt(await liquidityOf(TOKEN))).toBe(held + quote.liquidity);
      // The wallet paid the need and not the maximum, and got the position's fees with the change.
      expect(await usdgBalance(user.address)).toBe(usdg - need1 + fees1);
      expect((await ethOf(user.address)) + gas).toBe(eth - need0 + fees0);
      // The approval was for the maximum and Permit2 pulled the maximum: nothing is left approved.
      expect(await usdgAllowance(user.address, quote.permit2)).toBe(0n);

      const after = await position(TOKEN, user.address);
      expect(after.place).toBe("collateral");
      expect(after.holdings).toMatchObject({ liquidity: held + quote.liquidity, fees0: 0n, fees1: 0n });
    });

    it("on a position with a loan: the loan is healthier for it", async () => {
      const user = await depositor();
      await borrow(user.clients, blueChip, TOKEN, 300n * USDG);
      const before = await position(TOKEN, user.address);
      const { quote, max0, max1 } = await additionOf(user.address, 50);

      await increaseLiquidity(user.clients, blueChip, TOKEN, { liquidity: quote.liquidity, max0, max1 });

      const after = await position(TOKEN, user.address);
      expect(after.debt).toBeGreaterThanOrEqual(before.debt);
      expect(after.risk!.healthFactor).toBeGreaterThan(before.risk!.healthFactor);
      expect(after.risk!.maxBorrow).toBeGreaterThan(before.risk!.maxBorrow);
    });

    it("a pair of two ERC-20 tokens: both are approved for their maximum, pulled through one permit, and nothing stays approved", async () => {
      const tokenId = POSITIONS.metaUsdgInRange;
      const user = await depositor(tokenId);
      const meta = META_USDG.key.currency1;
      await deal(meta, user.address, 100n * WAD);
      const { quote, need0, need1, max0, max1 } = await additionOf(user.address, 25, tokenId);
      // USDG is currency0 in META/USDG.
      expect(quote.poolKey.currency0.toLowerCase()).toBe(USDG_TOKEN.toLowerCase());
      expect(permittedFor(quote.poolKey, max0, max1).map(({ token }) => token)).toEqual([quote.poolKey.currency0, meta]);
      const { fees0, fees1 } = (await position(tokenId, user.address)).holdings!;
      const usdg = await usdgBalance(user.address);
      const eth = await ethOf(user.address);
      const steps: string[] = [];

      await increaseLiquidity(user.clients, blueChip, tokenId, { liquidity: quote.liquidity, max0, max1 }, (step) =>
        steps.push(`${step.name}:${step.phase}`),
      );

      expect(steps.filter((step) => step === "approveAddition:confirm")).toHaveLength(2);
      expect(await usdgBalance(user.address)).toBe(usdg - need0 + fees0);
      const metaOf = (owner: `0x${string}`) => publicClient.readContract({ address: meta, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
      expect(await metaOf(user.address)).toBe(100n * WAD - need1 + fees1);
      // No ETH went in: only gas left the wallet.
      expect(eth - (await ethOf(user.address))).toBeLessThan(WAD / 100n);
      expect(await usdgAllowance(user.address, quote.permit2)).toBe(0n);
      expect(
        await publicClient.readContract({ address: meta, abi: erc20Abi, functionName: "allowance", args: [user.address, quote.permit2] }),
      ).toBe(0n);
    });
  });

  describe("negative", () => {
    it("a price that moved past a maximum before the click: refused before anything is approved or signed", async () => {
      const user = await depositor();
      const { quote, max0, max1 } = await additionOf(user.address, 25);

      // 1.5% up: the same liquidity now takes less ETH and more USDG than the maximum allows.
      await movePoolPrice(ETH_USDG.id, 150);
      const nonce = await nonceOf(user.address);
      const steps: string[] = [];
      const thrown = await refusal(
        increaseLiquidity(user.clients, blueChip, TOKEN, { liquidity: quote.liquidity, max0, max1 }, (step) => steps.push(step.name)),
      );

      expect(thrown.code).toBe("MaximumAmountExceeded");
      expect(thrown.message).toMatch(/price moved.*Get a new quote/);
      expect(steps, "the wallet was asked for something").toEqual([]);
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await usdgAllowance(user.address, quote.permit2)).toBe(0n);

      // A new quote at the same tolerance goes through.
      const again = await additionOf(user.address, 25);
      expect(again.need1).toBeGreaterThan(max1);
      await increaseLiquidity(user.clients, blueChip, TOKEN, { liquidity: again.quote.liquidity, max0: again.max0, max1: again.max1 });
      expect(BigInt(await liquidityOf(TOKEN))).toBeGreaterThan(BigInt(quote.liquidity) * 4n);
    });

    it("a price that moves after the permit is signed: the maximum holds, and the pool's own check reverts the addition", async () => {
      const user = await depositor();
      const { quote, max0, max1 } = await additionOf(user.address, 25);
      // What the app would have sent: USDG approved to Permit2 for its maximum, and the permit for the same.
      const hash = await user.clients.walletClient.writeContract({
        address: USDG_TOKEN,
        abi: erc20Abi,
        functionName: "approve",
        args: [quote.permit2, max1],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const { permit, signature } = await signAdditionPermit(user.clients, market, quote.permit2, permittedFor(quote.poolKey, max0, max1));
      const held = await liquidityOf(TOKEN);

      await movePoolPrice(ETH_USDG.id, 150);
      const reverted = await publicClient
        .simulateContract({
          address: market,
          abi: marketAbi,
          functionName: "increaseLiquidity",
          args: [TOKEN, quote.liquidity, max0, max1, permit, signature],
          value: max0,
          account: user.address,
        })
        .then(
          () => null,
          (error: unknown) => explainAdditionError(error),
        );

      expect(reverted?.code).toBe("MaximumAmountExceeded");
      expect(await liquidityOf(TOKEN)).toBe(held);
    });

    it("a pool that takes no new capital, a paused market, and someone else's position: each refused before the wallet is asked", async () => {
      const user = await depositor();
      const stranger = await newUser("stranger");
      await dealUsdg(stranger.address, 5_000n * USDG);
      const { quote, max0, max1 } = await additionOf(user.address, 25);
      const add = (clients: typeof user.clients, steps: string[]) =>
        increaseLiquidity(clients, blueChip, TOKEN, { liquidity: quote.liquidity, max0, max1 }, (step) => steps.push(step.name));
      const steps: string[] = [];

      expect(increaseLiquidityGate(await position(TOKEN, stranger.address))).toMatchObject({ ok: false, code: "NotTheDepositor" });
      expect((await refusal(add(stranger.clients, steps))).code).toBe("NotTheDepositor");

      await freeze(ETH_USDG.id);
      const frozen = increaseLiquidityGate(await position(TOKEN, user.address));
      expect(frozen).toMatchObject({ ok: false, code: "PoolFrozenForNewPositions" });
      expect(frozen.ok === false && frozen.message).toMatch(/no added liquidity/);
      expect((await refusal(add(user.clients, steps))).code).toBe("PoolFrozenForNewPositions");

      await pause(market);
      expect(increaseLiquidityGate(await position(TOKEN, user.address))).toMatchObject({ ok: false, code: "EnforcedPause" });
      expect((await refusal(add(user.clients, steps))).code).toBe("EnforcedPause");

      expect(steps, "a wallet was asked for something").toEqual([]);
      expect(await usdgAllowance(user.address, quote.permit2)).toBe(0n);
    });

    it("a wallet that cannot pay the maximum is told so, and nothing is approved", async () => {
      const user = await depositor(TOKEN, 1n * USDG);
      const { quote, max0, max1 } = await additionOf(user.address, 25);
      const gate = additionFundsGate({ max0, max1, ...quote }, ["ETH", "USDG"]);
      expect(gate).toMatchObject({ ok: false, code: "InsufficientBalance" });
      expect(gate.ok === false && gate.message).toMatch(/less USDG than/);
      const nonce = await nonceOf(user.address);

      const thrown = await refusal(increaseLiquidity(user.clients, blueChip, TOKEN, { liquidity: quote.liquidity, max0, max1 }));

      expect(thrown.code).toBe("InsufficientBalance");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
    });
  });

  describe("edge case", () => {
    it("a position above its range takes USDG only: no ETH is sent, and the permit still names the one ERC-20 leg", async () => {
      const tokenId = POSITIONS.ethUsdgAboveRange;
      const user = await depositor(tokenId);
      const { quote, need0, need1, max0, max1 } = await additionOf(user.address, 100, tokenId);
      expect(need0).toBe(0n);
      expect(max0).toBe(0n);
      // The position holds 200 USDG; as much again takes 200, to within a unit of rounding.
      expect(need1).toBeGreaterThan(199n * USDG);
      expect(need1).toBeLessThanOrEqual(200n * USDG + 1n);
      expect(permittedFor(quote.poolKey, max0, max1)).toEqual([{ token: quote.poolKey.currency1, amount: max1 }]);
      const usdg = await usdgBalance(user.address);
      const { fees1 } = (await position(tokenId, user.address)).holdings!;
      const held = BigInt(await liquidityOf(tokenId));

      await increaseLiquidity(user.clients, blueChip, tokenId, { liquidity: quote.liquidity, max0, max1 });

      expect(await usdgBalance(user.address)).toBe(usdg - need1 + fees1);
      expect(BigInt(await liquidityOf(tokenId))).toBe(held * 2n);
    });

    it("with no tolerance at all the maximum is the need, and the pool takes exactly that", async () => {
      const user = await depositor();
      const { quote, need0, need1, max0, max1 } = await additionOf(user.address, 25, TOKEN, 0);
      expect({ max0, max1 }).toEqual({ max0: need0, max1: need1 });
      const held = BigInt(await liquidityOf(TOKEN));

      await increaseLiquidity(user.clients, blueChip, TOKEN, { liquidity: quote.liquidity, max0, max1 });

      expect(BigInt(await liquidityOf(TOKEN))).toBe(held + quote.liquidity);
    });

    it("one unit under the need is refused by the pool: the maximum is a bound the contract holds", async () => {
      const user = await depositor();
      const { quote, need0, need1 } = await additionOf(user.address, 25, TOKEN, 0);
      const short = { liquidity: quote.liquidity, max0: need0, max1: need1 - 1n };
      const approve = await user.clients.walletClient.writeContract({ address: USDG_TOKEN, abi: erc20Abi, functionName: "approve", args: [quote.permit2, need1] });
      await publicClient.waitForTransactionReceipt({ hash: approve });
      const { permit, signature } = await signAdditionPermit(user.clients, market, quote.permit2, permittedFor(quote.poolKey, short.max0, short.max1));

      const reverted = await publicClient
        .simulateContract({
          address: market,
          abi: marketAbi,
          functionName: "increaseLiquidity",
          args: [TOKEN, short.liquidity, short.max0, short.max1, permit, signature],
          value: short.max0,
          account: user.address,
        })
        .then(
          () => null,
          (error: unknown) => explainAdditionError(error),
        );

      expect(reverted?.code).toBe("MaximumAmountExceeded");
    });

    it("the ETH sent is the maximum, and a native pool's permit names no ETH", async () => {
      const user = await depositor();
      const { quote, max0, max1 } = await additionOf(user.address, 25);
      expect(quote.poolKey.currency0).toBe(zeroAddress);
      expect(permittedFor(quote.poolKey, max0, max1).map(({ token }) => token)).toEqual([quote.poolKey.currency1]);
      const sent: bigint[] = [];

      await increaseLiquidity(
        {
          ...user.clients,
          walletClient: {
            ...user.clients.walletClient,
            writeContract: async (args: { value?: bigint; functionName: string }) => {
              if (args.functionName === "increaseLiquidity") sent.push(args.value ?? 0n);
              return user.clients.walletClient.writeContract(args as never);
            },
          } as never,
        },
        blueChip,
        TOKEN,
        { liquidity: quote.liquidity, max0, max1 },
      );

      expect(sent).toEqual([max0]);
    });
  });
});
