import { createWalletClient, custom, http, type EIP1193RequestFn } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, robinhood } from "viem/chains";
import { afterEach, describe, expect, inject, it, vi } from "vitest";

import {
  borrow,
  collectFees,
  decreaseLiquidity,
  depositCollateral,
  repay,
  supply,
  withdraw,
  withdrawCollateral,
} from "@/lib/onchain/actions";
import { ActionError } from "@/lib/onchain/errors";
import {
  borrowGate,
  collectFeesGate,
  decreaseLiquidityGate,
  depositCollateralGate,
  repayGate,
  sessionGate,
  supplyGate,
  withdrawCollateralGate,
  withdrawGate,
} from "@/lib/onchain/gates";
import { readLenderState, readPosition, type Clients } from "@/lib/onchain/reads";
import { DEFAULT_TOLERANCE_BPS, liquidityFor, minimumsFor, readRemoval } from "@/lib/onchain/removal";

import { ETH_USDG, POSITIONS, userKey } from "./support/constants";
import {
  blueChip,
  dealUsdg,
  debtOf,
  freeze,
  givePosition,
  isolateEachTest,
  newUser,
  nonceOf,
  ownerOf,
  pause,
  publicClient,
  sharesOf,
  usdgBalance,
} from "./support/fork";

const USDG = 1_000_000n;
const { market } = blueChip;

/** Three positions of the listed ETH/USDG and META/USDG pools, one per role below. */
const INDEBTED = POSITIONS.ethUsdgInRange;
const DEBT_FREE = POSITIONS.ethUsdgAboveRange;
const IN_WALLET = POSITIONS.metaUsdgInRange;

async function refusal(action: Promise<unknown>) {
  const error = await action.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error, "the action went through").toBeInstanceOf(ActionError);
  return error as ActionError;
}

/**
 * A market in use: a lender with a deposit, and a borrower with one position
 * carrying a loan, one deposited without a loan, and one still in the wallet.
 */
async function marketInUse() {
  const lender = await newUser("lender");
  await dealUsdg(lender.address, 10_000n * USDG);
  await supply(lender.clients, blueChip, 5_000n * USDG);

  const borrower = await newUser("borrower");
  for (const tokenId of [INDEBTED, DEBT_FREE, IN_WALLET]) await givePosition(borrower.address, tokenId);
  await depositCollateral(borrower.clients, blueChip, INDEBTED);
  await depositCollateral(borrower.clients, blueChip, DEBT_FREE);
  await borrow(borrower.clients, blueChip, INDEBTED, 100n * USDG);

  return { lender, borrower };
}

/** A quarter of a position's liquidity, with the minimums of its quote: what the panel would send. */
async function aQuarterOf(tokenId: bigint, account: `0x${string}`) {
  const liquidity = liquidityFor((await position(tokenId, account)).holdings!.liquidity, 25);
  const { quote } = await readRemoval(publicClient, market, tokenId, account, liquidity);
  return { liquidity, ...minimumsFor(quote, DEFAULT_TOLERANCE_BPS) };
}

const lenderState = (account: `0x${string}`) => readLenderState(publicClient, market, account);
const position = (tokenId: bigint, account: `0x${string}`) => readPosition(publicClient, blueChip, tokenId, account);

describe("a paused market", () => {
  isolateEachTest();

  describe("negative", () => {
    it("stops supplying, depositing collateral, borrowing, collecting fees and removing liquidity, each with the reason", async () => {
      const { lender, borrower } = await marketInUse();
      const quarter = await aQuarterOf(DEBT_FREE, borrower.address);
      await pause(market);

      const gates = [
        supplyGate(await lenderState(lender.address), 100n * USDG),
        depositCollateralGate(await position(IN_WALLET, borrower.address)),
        borrowGate(await position(INDEBTED, borrower.address), 10n * USDG),
        // With a loan and without: the pause stops it either way.
        collectFeesGate(await position(INDEBTED, borrower.address)),
        collectFeesGate(await position(DEBT_FREE, borrower.address)),
        decreaseLiquidityGate(await position(INDEBTED, borrower.address), DEFAULT_TOLERANCE_BPS),
        decreaseLiquidityGate(await position(DEBT_FREE, borrower.address), DEFAULT_TOLERANCE_BPS),
      ];
      for (const gate of gates) {
        expect(gate).toMatchObject({ ok: false, code: "EnforcedPause" });
        expect(gate.ok === false && gate.message).toMatch(/paused/);
      }

      const lenderNonce = await nonceOf(lender.address);
      const borrowerNonce = await nonceOf(borrower.address);
      expect((await refusal(supply(lender.clients, blueChip, 100n * USDG))).code).toBe("EnforcedPause");
      expect((await refusal(depositCollateral(borrower.clients, blueChip, IN_WALLET))).code).toBe("EnforcedPause");
      expect((await refusal(borrow(borrower.clients, blueChip, INDEBTED, 10n * USDG))).code).toBe("EnforcedPause");
      expect((await refusal(collectFees(borrower.clients, blueChip, INDEBTED))).code).toBe("EnforcedPause");
      expect((await refusal(collectFees(borrower.clients, blueChip, DEBT_FREE))).code).toBe("EnforcedPause");
      expect((await refusal(decreaseLiquidity(borrower.clients, blueChip, DEBT_FREE, quarter))).code).toBe("EnforcedPause");
      // Nothing is quoted either: the reason comes back in the quote's place.
      expect((await refusal(readRemoval(publicClient, market, DEBT_FREE, borrower.address, quarter.liquidity))).code).toBe("EnforcedPause");
      expect(await nonceOf(lender.address), "the lender sent a transaction").toBe(lenderNonce);
      expect(await nonceOf(borrower.address), "the borrower sent a transaction").toBe(borrowerNonce);
      expect(await ownerOf(IN_WALLET)).toBe(borrower.address);
    });
  });

  describe("positive", () => {
    it("still repays, withdraws USDG and withdraws collateral", async () => {
      const { lender, borrower } = await marketInUse();
      await pause(market);

      expect(repayGate(await position(INDEBTED, borrower.address), "max")).toEqual({ ok: true });
      expect(withdrawGate(await lenderState(lender.address), 1_000n * USDG)).toEqual({ ok: true });
      expect(withdrawCollateralGate(await position(DEBT_FREE, borrower.address))).toEqual({ ok: true });

      await dealUsdg(borrower.address, 200n * USDG);
      await repay(borrower.clients, blueChip, INDEBTED, "max");
      expect(await debtOf(market, INDEBTED)).toBe(0n);

      const shares = await sharesOf(market, lender.address);
      await withdraw(lender.clients, blueChip, 1_000n * USDG);
      expect(await usdgBalance(lender.address)).toBe(6_000n * USDG);
      expect(await sharesOf(market, lender.address)).toBeLessThan(shares);

      await withdrawCollateral(borrower.clients, blueChip, DEBT_FREE);
      expect(await ownerOf(DEBT_FREE)).toBe(borrower.address);
    });
  });

  describe("edge case", () => {
    it("lets the repaid position's collateral out too, in the same pause", async () => {
      const { borrower } = await marketInUse();
      await pause(market);
      await dealUsdg(borrower.address, 200n * USDG);

      await repay(borrower.clients, blueChip, INDEBTED, "max");
      await withdrawCollateral(borrower.clients, blueChip, INDEBTED);

      expect(await ownerOf(INDEBTED)).toBe(borrower.address);
    });
  });
});

describe("a frozen pool", () => {
  isolateEachTest();

  describe("negative", () => {
    it("stops depositing collateral and borrowing", async () => {
      const lender = await newUser("lender");
      await dealUsdg(lender.address, 5_000n * USDG);
      await supply(lender.clients, blueChip, 5_000n * USDG);
      const borrower = await newUser("borrower");
      await givePosition(borrower.address, INDEBTED);
      await givePosition(borrower.address, DEBT_FREE);
      await depositCollateral(borrower.clients, blueChip, INDEBTED);
      await freeze(ETH_USDG.id);

      expect(depositCollateralGate(await position(DEBT_FREE, borrower.address))).toMatchObject({
        ok: false,
        code: "PoolFrozenForNewPositions",
      });
      expect(borrowGate(await position(INDEBTED, borrower.address), 50n * USDG)).toMatchObject({
        ok: false,
        code: "PoolNotOpenForBorrowing",
      });

      const nonce = await nonceOf(borrower.address);
      const steps: string[] = [];
      const refused = await refusal(
        depositCollateral(borrower.clients, blueChip, DEBT_FREE, (step) => steps.push(step.name)),
      );
      expect(refused.code).toBe("PoolFrozenForNewPositions");
      expect(steps, "a pool frozen a moment ago cost the user a signature").toEqual([]);
      expect((await refusal(borrow(borrower.clients, blueChip, INDEBTED, 50n * USDG))).code).toBe(
        "PoolNotOpenForBorrowing",
      );
      expect(await nonceOf(borrower.address), "a transaction was sent").toBe(nonce);
      expect(await ownerOf(DEBT_FREE)).toBe(borrower.address);
      expect(await debtOf(market, INDEBTED)).toBe(0n);
    });
  });

  describe("positive", () => {
    it("still removes liquidity", async () => {
      const { borrower } = await marketInUse();
      await freeze(ETH_USDG.id);

      for (const tokenId of [INDEBTED, DEBT_FREE]) {
        const state = await position(tokenId, borrower.address);
        expect(decreaseLiquidityGate(state, DEFAULT_TOLERANCE_BPS)).toEqual({ ok: true });
        await decreaseLiquidity(borrower.clients, blueChip, tokenId, await aQuarterOf(tokenId, borrower.address));
        const left = (await position(tokenId, borrower.address)).holdings!.liquidity;
        expect(left).toBe(state.holdings!.liquidity - liquidityFor(state.holdings!.liquidity, 25));
      }
    });

    it("still collects fees, repays and withdraws collateral", async () => {
      const { borrower } = await marketInUse();
      await freeze(ETH_USDG.id);

      const frozen = await position(INDEBTED, borrower.address);
      expect(frozen.pool.status).toBe("frozen");
      expect(collectFeesGate(frozen)).toEqual({ ok: true });
      expect(repayGate(frozen, "max")).toEqual({ ok: true });

      // The loan's 100 USDG is in the wallet; what arrives on top of it is the fees.
      await collectFees(borrower.clients, blueChip, INDEBTED);
      expect(await usdgBalance(borrower.address)).toBeGreaterThan(100n * USDG);
      expect((await position(INDEBTED, borrower.address)).holdings!.feesUsd).toBe(0n);
      await dealUsdg(borrower.address, 200n * USDG);

      await repay(borrower.clients, blueChip, INDEBTED, "max");
      await withdrawCollateral(borrower.clients, blueChip, INDEBTED);
      await withdrawCollateral(borrower.clients, blueChip, DEBT_FREE);

      expect(await ownerOf(INDEBTED)).toBe(borrower.address);
      expect(await ownerOf(DEBT_FREE)).toBe(borrower.address);
    });
  });

  describe("edge case", () => {
    it("leaves the other pool of the market open", async () => {
      const { borrower } = await marketInUse();
      await freeze(ETH_USDG.id);

      // IN_WALLET is a META/USDG position; only ETH/USDG was frozen.
      expect(depositCollateralGate(await position(IN_WALLET, borrower.address))).toEqual({ ok: true });
      await depositCollateral(borrower.clients, blueChip, IN_WALLET);
      await borrow(borrower.clients, blueChip, IN_WALLET, 20n * USDG);

      expect(await debtOf(market, IN_WALLET)).toBeGreaterThanOrEqual(20n * USDG);
    });

    it("leaves supplying and withdrawing USDG alone: a freeze is about one pool's collateral", async () => {
      const { lender } = await marketInUse();
      await freeze(ETH_USDG.id);

      await supply(lender.clients, blueChip, 100n * USDG);
      await withdraw(lender.clients, blueChip, 50n * USDG);

      expect(await usdgBalance(lender.address)).toBe(4_950n * USDG);
    });
  });
});

describe("a wallet on another network", () => {
  isolateEachTest();

  /**
   * A wallet that reports `chainId` for itself and otherwise talks to the
   * fork: what an injected wallet switched to another network looks like.
   */
  function walletOn(chainId: number, label: string): Clients {
    const forward = http(inject("forkUrl"))({ chain: robinhood }).request;
    const request = (async ({ method, params }) =>
      method === "eth_chainId" ? `0x${chainId.toString(16)}` : forward({ method, params })) as EIP1193RequestFn;
    const account = privateKeyToAccount(userKey(label));
    return { publicClient, walletClient: createWalletClient({ account, chain: robinhood, transport: custom({ request }) }) };
  }

  describe("negative", () => {
    it("cannot send any of the eight transactions", async () => {
      const { lender, borrower } = await marketInUse();
      await dealUsdg(borrower.address, 500n * USDG);
      const astray = { lender: walletOn(mainnet.id, "lender"), borrower: walletOn(mainnet.id, "borrower") };
      const quarter = await aQuarterOf(DEBT_FREE, borrower.address);
      const lenderNonce = await nonceOf(lender.address);
      const borrowerNonce = await nonceOf(borrower.address);

      // Each of these would go through from a wallet on chain 4663: `marketInUse` left the
      // state they need. One at a time, as a user would send them.
      const attempts = [
        () => supply(astray.lender, blueChip, 100n * USDG),
        () => withdraw(astray.lender, blueChip, 100n * USDG),
        () => depositCollateral(astray.borrower, blueChip, IN_WALLET),
        () => borrow(astray.borrower, blueChip, INDEBTED, 10n * USDG),
        () => repay(astray.borrower, blueChip, INDEBTED, "max"),
        () => withdrawCollateral(astray.borrower, blueChip, DEBT_FREE),
        () => collectFees(astray.borrower, blueChip, INDEBTED),
        () => decreaseLiquidity(astray.borrower, blueChip, DEBT_FREE, quarter),
      ];
      for (const attempt of attempts) expect((await refusal(attempt())).code).toBe("WrongNetwork");

      expect(await nonceOf(lender.address), "the lender sent a transaction").toBe(lenderNonce);
      expect(await nonceOf(borrower.address), "the borrower sent a transaction").toBe(borrowerNonce);
    });

    it("has its buttons disabled by the session gate until it switches", () => {
      const session = { deployed: true, account: privateKeyToAccount(userKey("lender")).address, chainId: robinhood.id, chainName: robinhood.name };

      expect(sessionGate({ ...session, walletChainId: mainnet.id })).toMatchObject({ ok: false, code: "WrongNetwork" });
      expect(sessionGate({ ...session, walletChainId: robinhood.id })).toEqual({ ok: true });
    });
  });

  describe("positive", () => {
    it("sends once it reports chain 4663", async () => {
      const { lender } = await marketInUse();

      await supply(walletOn(robinhood.id, "lender"), blueChip, 100n * USDG);

      expect(await usdgBalance(lender.address)).toBe(4_900n * USDG);
    });
  });

  describe("edge case", () => {
    it("is refused before the permit is signed, so no signature for chain 4663 is left lying around", async () => {
      const { borrower } = await marketInUse();
      const steps: string[] = [];

      await refusal(
        depositCollateral(walletOn(mainnet.id, "borrower"), blueChip, IN_WALLET, (step) => steps.push(step.name)),
      );

      expect(steps).toEqual([]);
      expect(await ownerOf(IN_WALLET)).toBe(borrower.address);
    });
  });
});

describe("with the backend down", () => {
  isolateEachTest();
  afterEach(() => vi.unstubAllGlobals());

  /** Fails every request that is not to the RPC, which is all a dead backend can do. */
  function onlyTheRpcAnswers() {
    const rpc = new URL(inject("forkUrl")).host;
    const real = globalThis.fetch;
    const calls: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url.host);
      return url.host === rpc ? real(input, init) : Promise.reject(new TypeError("fetch failed"));
    });
    return { rpc, calls };
  }

  describe("positive", () => {
    it("all eight actions go through, over the RPC alone", async () => {
      const lender = await newUser("lender");
      await dealUsdg(lender.address, 5_000n * USDG);
      const borrower = await newUser("borrower");
      await givePosition(borrower.address, INDEBTED);
      const { rpc, calls } = onlyTheRpcAnswers();

      await supply(lender.clients, blueChip, 5_000n * USDG);
      await depositCollateral(borrower.clients, blueChip, INDEBTED);
      await borrow(borrower.clients, blueChip, INDEBTED, 100n * USDG);
      await collectFees(borrower.clients, blueChip, INDEBTED);
      // The quote is read through the same RPC.
      await decreaseLiquidity(borrower.clients, blueChip, INDEBTED, await aQuarterOf(INDEBTED, borrower.address));
      await dealUsdg(borrower.address, 200n * USDG);
      await repay(borrower.clients, blueChip, INDEBTED, "max");
      await withdrawCollateral(borrower.clients, blueChip, INDEBTED);
      await withdraw(lender.clients, blueChip, 1_000n * USDG);

      expect(await ownerOf(INDEBTED)).toBe(borrower.address);
      expect(await usdgBalance(lender.address)).toBe(1_000n * USDG);
      expect(calls.length).toBeGreaterThan(0);
      expect(new Set(calls)).toEqual(new Set([rpc]));
    });
  });

  describe("negative", () => {
    it("a refusal is still the contract's, not a network failure", async () => {
      const lender = await newUser("lender");
      onlyTheRpcAnswers();

      expect((await refusal(withdraw(lender.clients, blueChip, 1n))).code).toBe("ERC4626ExceededMaxWithdraw");
    });
  });

  describe("edge case", () => {
    it("the reads an action is decided on need nothing but the RPC either", async () => {
      const borrower = await newUser("borrower");
      await givePosition(borrower.address, INDEBTED);
      const { rpc, calls } = onlyTheRpcAnswers();

      const state = await position(INDEBTED, borrower.address);
      await lenderState(borrower.address);

      expect(state.place).toBe("wallet");
      expect(new Set(calls)).toEqual(new Set([rpc]));
    });
  });
});
