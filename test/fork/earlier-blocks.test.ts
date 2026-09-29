import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startFork } from "../../scripts/fork.mjs";
import { borrow, depositCollateral } from "@/lib/onchain/actions";
import { describePosition } from "@/lib/onchain/describe";
import { ActionError, explainForPool } from "@/lib/onchain/errors";
import { borrowGate, depositCollateralGate } from "@/lib/onchain/gates";
import { readPool, readPosition } from "@/lib/onchain/reads";
import { poolById } from "@/lib/markets";

import {
  BEFORE_MEME_LISTINGS_BLOCK,
  BEFORE_MEME_PRICES_BLOCK,
  CASHCAT_USDG,
  ETH_USDG,
  META_USDG,
  NVDA_USDG,
  PONS_USDG,
  AI_USDG,
  POSITIONS,
} from "./support/constants";
import { harnessOn } from "./support/fork";

/**
 * What a pool's page says before its pool is ready, on the chain as it was
 * then: before the pool was listed, and, for a meme pool, after it was listed
 * and before any of its prices was recorded.
 *
 * Each block is a fork of its own, started here and stopped when its tests
 * are done. Positions are the ones of the run's fork, which existed already.
 */
const USDG = 1_000_000n;
const TOKEN = POSITIONS.cashcatUsdgInRange;
const page = poolById(CASHCAT_USDG.id)!;

type Fork = ReturnType<typeof harnessOn>;

async function refusal(action: Promise<unknown>) {
  const error = await action.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error, "the action went through").toBeInstanceOf(ActionError);
  return error as ActionError;
}

/** Starts a fork at `block` for the tests of one `describe`, with the pools that are listed there. */
function forkAt(block: bigint, listed: readonly { id: string }[]) {
  const started: { fork?: Fork; stop?: () => void } = {};
  beforeAll(async () => {
    const { url, manifest, stop } = await startFork({ block, listed: [...listed] });
    started.fork = harnessOn(url, manifest);
    started.stop = stop;
  }, 300_000);
  afterAll(() => started.stop?.());
  return () => started.fork!;
}

describe("before the meme pools were listed", () => {
  const on = forkAt(BEFORE_MEME_LISTINGS_BLOCK, [ETH_USDG, META_USDG, NVDA_USDG]);

  describe("negative", () => {
    it("a meme pool takes no collateral and gives no loan, because it is not listed", async () => {
      const { newUser, givePosition, publicClient, meme } = on();
      const user = await newUser("early");
      await givePosition(user.address, TOKEN);

      const state = await readPosition(publicClient, meme, TOKEN, user.address);

      expect(state.place).toBe("wallet");
      expect(state.poolId).toBe(CASHCAT_USDG.id);
      expect(state.pool).toEqual({ status: "unlisted", terms: null });
      const deposit = depositCollateralGate(state, CASHCAT_USDG.id);
      const loan = borrowGate(state, 50n * USDG);
      expect(deposit).toMatchObject({ ok: false, code: "PoolNotListed" });
      expect(loan).toMatchObject({ ok: false, code: "PoolNotListed" });
      expect(deposit.ok === false && deposit.message).toMatch(/not listed/);
      expect(loan.ok === false && loan.message).toMatch(/not listed/);
    });

    it("nothing is signed and nothing is sent for it", async () => {
      const { newUser, givePosition, nonceOf, ownerOf, meme } = on();
      const user = await newUser("early");
      await givePosition(user.address, TOKEN);
      const nonce = await nonceOf(user.address);
      const steps: string[] = [];

      const refused = await refusal(depositCollateral(user.clients, meme, TOKEN, (step) => steps.push(step.name)));

      expect(refused.code).toBe("PoolNotListed");
      expect(steps, "a signature was asked for").toEqual([]);
      expect((await refusal(borrow(user.clients, meme, TOKEN, 50n * USDG))).code).not.toBe("Unknown");
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await ownerOf(TOKEN)).toBe(user.address);
    });

    it("none of the three meme pools is listed", async () => {
      const { publicClient, meme } = on();

      for (const pool of [CASHCAT_USDG, PONS_USDG, AI_USDG]) {
        expect(await readPool(publicClient, meme.policy, pool.id), pool.id).toEqual({ status: "unlisted", terms: null });
      }
    });
  });

  describe("positive", () => {
    it("the three blue-chip pools, listed a round earlier, are open on their own terms", async () => {
      const { publicClient, blueChip } = on();

      expect(await readPool(publicClient, blueChip.policy, ETH_USDG.id)).toEqual({
        status: "open",
        terms: { maxLtvBps: 6500, ltBps: 7500 },
      });
      for (const pool of [META_USDG, NVDA_USDG]) {
        expect(await readPool(publicClient, blueChip.policy, pool.id), pool.id).toEqual({
          status: "open",
          terms: { maxLtvBps: 5000, ltBps: 6500 },
        });
      }
    });
  });

  describe("edge case", () => {
    it("the position is still shown for what it is: its pool's fee and its range", async () => {
      const { newUser, givePosition, publicClient, meme } = on();
      const user = await newUser("early");
      await givePosition(user.address, TOKEN);

      const { fee, range } = describePosition(await readPosition(publicClient, meme, TOKEN, user.address));

      expect(fee).toBe("0.269%");
      expect(range).toBe("0.1402 to 0.2498 USDG");
    });
  });
});

describe("after the meme pools were listed, before any of their prices was recorded", () => {
  const on = forkAt(BEFORE_MEME_PRICES_BLOCK, [ETH_USDG, META_USDG, NVDA_USDG, CASHCAT_USDG, PONS_USDG, AI_USDG]);

  describe("negative", () => {
    it("a meme pool takes no collateral yet, and says that its price has to be recorded for 30 minutes", async () => {
      const { newUser, givePosition, publicClient, meme, hasAveragePrice } = on();
      const user = await newUser("early");
      await givePosition(user.address, TOKEN);
      expect(await hasAveragePrice(CASHCAT_USDG.id)).toBe(false);

      const state = await readPosition(publicClient, meme, TOKEN, user.address);
      const gate = depositCollateralGate(state, CASHCAT_USDG.id);

      expect(state.pool.status).toBe("open");
      expect(state.holdings).toBeNull();
      expect(state.holdingsError?.code).toBe("MemeTwapUnavailable");
      expect(gate).toMatchObject({ ok: false, code: "MemeTwapUnavailable" });
      expect(gate.ok === false && explainForPool(gate, page).message).toMatch(/recorded for 30 minutes/);
    });

    it("nothing is signed and nothing is sent for it", async () => {
      const { newUser, givePosition, nonceOf, ownerOf, meme } = on();
      const user = await newUser("early");
      await givePosition(user.address, TOKEN);
      const nonce = await nonceOf(user.address);
      const steps: string[] = [];

      const refused = await refusal(depositCollateral(user.clients, meme, TOKEN, (step) => steps.push(step.name)));

      expect(refused.code).toBe("MemeTwapUnavailable");
      expect(steps, "a signature was asked for").toEqual([]);
      expect(await nonceOf(user.address), "a transaction was sent").toBe(nonce);
      expect(await ownerOf(TOKEN)).toBe(user.address);
    });

    it("one recording is not 30 minutes of them", async () => {
      const { newUser, givePosition, publicClient, meme, recordPrice, wait } = on();
      const user = await newUser("early");
      await givePosition(user.address, TOKEN);
      await recordPrice(CASHCAT_USDG.key);
      await wait(10 * 60);
      await recordPrice(CASHCAT_USDG.key);

      const state = await readPosition(publicClient, meme, TOKEN, user.address);

      expect(depositCollateralGate(state, CASHCAT_USDG.id)).toMatchObject({ ok: false, code: "MemeTwapUnavailable" });
    });
  });

  describe("positive", () => {
    it("takes the position once its price has been recorded for 30 minutes", async () => {
      const { newUser, givePosition, publicClient, meme, recordPrice, wait, ownerOf } = on();
      const user = await newUser("early");
      await givePosition(user.address, TOKEN);
      // Every five minutes for 35 minutes, as the keeper does.
      for (let recorded = 0; recorded <= 7; recorded++) {
        await recordPrice(CASHCAT_USDG.key);
        if (recorded < 7) await wait(5 * 60);
      }

      const state = await readPosition(publicClient, meme, TOKEN, user.address);
      expect(state.holdingsError).toBeNull();
      expect(depositCollateralGate(state, CASHCAT_USDG.id)).toEqual({ ok: true });
      await depositCollateral(user.clients, meme, TOKEN);

      expect((await ownerOf(TOKEN)).toLowerCase()).toBe(meme.market.toLowerCase());
    });
  });

  describe("edge case", () => {
    it("a blue-chip pool needs no recording: it is priced by Chainlink and open at once", async () => {
      const { newUser, givePosition, publicClient, blueChip } = on();
      const user = await newUser("early");
      await givePosition(user.address, POSITIONS.metaUsdgInRange);

      const state = await readPosition(publicClient, blueChip, POSITIONS.metaUsdgInRange, user.address);

      expect(state.holdingsError).toBeNull();
      expect(depositCollateralGate(state, META_USDG.id)).toEqual({ ok: true });
    });
  });
});
