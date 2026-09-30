import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { backendKeys, chainKeys, invalidateAfterTransaction } from "./query-keys";

const ALICE = "0x00000000000000000000000000000000000A11CE";
const BOB = "0x0000000000000000000000000000000000000B0B";
const ETH_USDG = "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32";
const WETH_USDG = "0x84bd4e2d8be11aeb0afc1195b38f587b61e90068548f1063fdbe448fb8cad0b6";

/** A client holding one fresh result under each key, the way a rendered page would. */
function clientWith(keys: readonly (readonly unknown[])[]) {
  const queryClient = new QueryClient();
  for (const key of keys) queryClient.setQueryData(key, { loaded: true });
  const stale = () =>
    keys.filter((key) => queryClient.getQueryState(key)?.isInvalidated).map((key) => JSON.stringify(key));
  return { queryClient, stale };
}

const key = (value: readonly unknown[]) => JSON.stringify(value);

describe("invalidateAfterTransaction", () => {
  describe("positive", () => {
    it("invalidates the portfolio, the pool, the market and the history", async () => {
      const keys = [
        backendKeys.markets(),
        backendKeys.pools("blue-chip"),
        backendKeys.pool(ETH_USDG),
        backendKeys.portfolio(ALICE),
        backendKeys.activity(ALICE),
      ];
      const { queryClient, stale } = clientWith(keys);

      await invalidateAfterTransaction(queryClient, { tier: "blue-chip", account: ALICE, poolId: ETH_USDG });

      expect(stale()).toEqual(keys.map(key));
    });

    it("invalidates what was read from the chain, so the panel reads it again", async () => {
      const keys = [chainKeys.lender("blue-chip", ALICE), chainKeys.position("blue-chip", 1_768_881n, ALICE)];
      const { queryClient, stale } = clientWith(keys);

      await invalidateAfterTransaction(queryClient, { tier: "blue-chip", account: ALICE });

      expect(stale()).toEqual(keys.map(key));
    });
  });

  describe("negative", () => {
    it("leaves another account's portfolio and the other market's pools alone", async () => {
      const untouched = [
        backendKeys.portfolio(BOB),
        backendKeys.activity(BOB),
        backendKeys.pools("meme"),
        backendKeys.pool(WETH_USDG),
      ];
      const { queryClient, stale } = clientWith([...untouched, backendKeys.portfolio(ALICE)]);

      await invalidateAfterTransaction(queryClient, { tier: "blue-chip", account: ALICE, poolId: ETH_USDG });

      expect(stale()).toEqual([key(backendKeys.portfolio(ALICE))]);
    });
  });

  describe("edge case", () => {
    it("finds a key whatever the case of the address or the pool id it was fetched under", async () => {
      const fetched = [backendKeys.portfolio(ALICE.toLowerCase() as `0x${string}`), backendKeys.pool(ETH_USDG)];
      const { queryClient, stale } = clientWith(fetched);

      await invalidateAfterTransaction(queryClient, {
        tier: "blue-chip",
        account: ALICE,
        poolId: ETH_USDG.toUpperCase().replace("0X", "0x") as `0x${string}`,
      });

      expect(stale()).toEqual(fetched.map(key));
    });

    it("invalidates the history of every range a page has fetched, and no other pool's", async () => {
      const fetched = [backendKeys.markets("1w"), backendKeys.markets("3m"), backendKeys.pool(ETH_USDG, "1m")];
      const { queryClient, stale } = clientWith([...fetched, backendKeys.pool(WETH_USDG, "1m")]);

      await invalidateAfterTransaction(queryClient, { tier: "blue-chip", account: ALICE, poolId: ETH_USDG });

      expect(stale()).toEqual(fetched.map(key));
    });

    it("invalidates the pool's list of transactions, whichever kind it was narrowed to, and no other pool's", async () => {
      const fetched = [backendKeys.poolActivity(ETH_USDG, "all"), backendKeys.poolActivity(ETH_USDG, "borrow")];
      const { queryClient, stale } = clientWith([...fetched, backendKeys.poolActivity(WETH_USDG, "all")]);

      await invalidateAfterTransaction(queryClient, { tier: "blue-chip", account: ALICE, poolId: ETH_USDG });

      expect(stale()).toEqual(fetched.map(key));
    });

    it("a supply, which has no pool, leaves every pool's list of transactions as it is", async () => {
      const lists = [backendKeys.poolActivity(ETH_USDG, "all"), backendKeys.poolActivity(WETH_USDG, "all")];
      const { queryClient, stale } = clientWith(lists);

      await invalidateAfterTransaction(queryClient, { tier: "blue-chip", account: ALICE, poolId: null });

      expect(stale()).toEqual([]);
    });

    it("a supply, which has no pool, still invalidates the market and the account", async () => {
      const keys = [backendKeys.markets(), backendKeys.pools("meme"), backendKeys.portfolio(ALICE)];
      const { queryClient, stale } = clientWith([...keys, backendKeys.pool(ETH_USDG)]);

      await invalidateAfterTransaction(queryClient, { tier: "meme", account: ALICE, poolId: null });

      expect(stale()).toEqual(keys.map(key));
    });
  });
});
