import { focusManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { createPublicClient, custom, http, type EIP1193RequestFn } from "viem";
import { robinhood } from "viem/chains";
import { afterEach, describe, expect, inject, it } from "vitest";

import { borrow, depositCollateral, supply, withdrawCollateral } from "@/lib/onchain/actions";
import {
  discoverPositions,
  inPool,
  POSITION_MANAGER_START_BLOCK,
  walletPositionsQuery,
  type Discovered,
} from "@/lib/onchain/discovery";
import { feeLabel } from "@/lib/onchain/range";
import { readPosition, type ReadClient } from "@/lib/onchain/reads";

import { ETH_USDG, FORK_BLOCK, POSITION_MANAGER, POSITIONS, WETH_USDG } from "./support/constants";
import {
  blueChip,
  dealUsdg,
  emptyPosition,
  givePosition,
  isolateEachTest,
  liquidityOf,
  meme,
  newUser,
  ownerOf,
  publicClient,
} from "./support/fork";

/**
 * How a position gets onto the screen: found in the chain's logs, with no
 * token id entered anywhere.
 *
 * The logs are read from the fork's block: the fork's upstream is a free-tier
 * RPC, which refuses the range from PositionManager's deployment. Every
 * position a test wallet holds reached it on the fork, after that block.
 */
const markets = { "blue-chip": blueChip, meme };
const clients = { logs: publicClient, reads: publicClient };
const find = (account: `0x${string}`) => discoverPositions(clients, markets, account, FORK_BLOCK);

const USDG = 1_000_000n;
const idsOf = (positions: readonly Discovered[]) => positions.map((position) => position.tokenId);

/** A client that reads everything from the fork except the logs of `address`, which fail. */
function logsFailingFor(address: string): ReadClient {
  const forward = http(inject("forkUrl"))({ chain: robinhood, retryCount: 0 }).request;
  const request = (async ({ method, params }) => {
    const filter = (params as [{ address?: string }] | undefined)?.[0];
    if (method === "eth_getLogs" && filter?.address?.toLowerCase() === address.toLowerCase()) {
      throw new Error("HTTP 429: Too Many Requests");
    }
    return forward({ method, params });
  }) as EIP1193RequestFn;
  return createPublicClient({ chain: robinhood, transport: custom({ request }, { retryCount: 0 }) }) as ReadClient;
}

describe("finding a wallet's positions", () => {
  isolateEachTest();

  describe("positive", () => {
    it("a wallet holding positions in a listed pool sees them, with no id entered", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);
      await givePosition(user.address, POSITIONS.wethUsdgInRange);

      const found = await find(user.address);

      expect(found.map((position) => position.tokenId).sort()).toEqual(
        [POSITIONS.ethUsdgInRange, POSITIONS.ethUsdgAboveRange, POSITIONS.wethUsdgInRange].sort(),
      );
      expect(found.every((position) => position.place === "wallet" && position.tier === null)).toBe(true);
      // The ETH/USDG page lists its two and not the WETH/USDG one.
      expect(inPool(found, ETH_USDG.id).map((position) => position.tokenId).sort()).toEqual(
        [POSITIONS.ethUsdgInRange, POSITIONS.ethUsdgAboveRange].sort(),
      );
      expect(inPool(found, WETH_USDG.id).map((position) => position.tokenId)).toEqual([POSITIONS.wethUsdgInRange]);
    });

    it("a deposited position is listed as collateral of the market that holds it", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await givePosition(user.address, POSITIONS.wethUsdgInRange);
      await depositCollateral(user.clients, blueChip, POSITIONS.ethUsdgInRange);

      const found = await find(user.address);

      expect(found.find((position) => position.tokenId === POSITIONS.ethUsdgInRange)).toMatchObject({
        place: "collateral",
        tier: "blue-chip",
        poolId: ETH_USDG.id,
      });
      expect(found.find((position) => position.tokenId === POSITIONS.wethUsdgInRange)).toMatchObject({
        place: "wallet",
        tier: null,
      });
      expect(found).toHaveLength(2);
    });

    it("shows a position by its pair's fee, its range and its value, in the wallet too", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);

      const [found] = inPool(await find(user.address), ETH_USDG.id).filter(
        (position) => position.tokenId === POSITIONS.ethUsdgInRange,
      );
      const inRange = await readPosition(publicClient, blueChip, POSITIONS.ethUsdgInRange, user.address);
      const above = await readPosition(publicClient, blueChip, POSITIONS.ethUsdgAboveRange, user.address);

      expect(feeLabel(found.poolKey.fee)).toBe("0.046%");
      expect(inRange.ticks).toEqual({ tickLower: found.tickLower, tickUpper: found.tickUpper });
      expect(inRange.ticks!.tickLower).toBeLessThan(inRange.ticks!.tickUpper);
      expect(inRange.decimals).toEqual([18, 6]);
      // Fixtures.sol: in range, so it holds both tokens; the other is above range and holds only USDG.
      expect(inRange.holdings!.amount0).toBeGreaterThan(0n);
      expect(inRange.holdings!.amount1).toBeGreaterThan(0n);
      expect(above.holdings!.amount0).toBe(0n);
      expect(above.holdings!.amount1).toBeGreaterThan(0n);
      // The lens cannot value a position the market does not hold; the valuer can.
      expect(inRange.risk).toBeNull();
      expect(inRange.holdings!.principalUsd).toBeGreaterThan(50n * 10n ** 18n);
    });
  });

  describe("negative", () => {
    it("a position transferred away disappears", async () => {
      const user = await newUser("holder");
      const other = await newUser("other");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);
      expect(await find(user.address)).toHaveLength(2);

      await givePosition(other.address, POSITIONS.ethUsdgInRange);

      expect((await find(user.address)).map((position) => position.tokenId)).toEqual([POSITIONS.ethUsdgAboveRange]);
      expect((await find(other.address)).map((position) => position.tokenId)).toEqual([POSITIONS.ethUsdgInRange]);
    });

    it("a position emptied through PositionManager is left out; the one with liquidity is listed", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);
      expect(idsOf(await find(user.address)).sort()).toEqual([POSITIONS.ethUsdgInRange, POSITIONS.ethUsdgAboveRange].sort());

      await emptyPosition(user.clients, POSITIONS.ethUsdgInRange);

      // Still the wallet's NFT, holding nothing.
      expect(await ownerOf(POSITIONS.ethUsdgInRange)).toBe(user.address);
      expect(await liquidityOf(POSITIONS.ethUsdgInRange)).toBe(0n);
      const found = await find(user.address);
      expect(idsOf(found)).toEqual([POSITIONS.ethUsdgAboveRange]);
      expect(found[0].liquidity).toBeGreaterThan(0n);
      expect(idsOf(inPool(found, ETH_USDG.id))).toEqual([POSITIONS.ethUsdgAboveRange]);
    });

    it("reports the failure when only PositionManager's logs cannot be read", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await givePosition(user.address, POSITIONS.wethUsdgInRange);
      await depositCollateral(user.clients, blueChip, POSITIONS.ethUsdgInRange);
      const logs = logsFailingFor(POSITION_MANAGER);

      // The market's logs answer, so the collateral could be listed. It must not be, alone:
      // that list would silently leave out what is in the wallet.
      await expect(discoverPositions({ logs, reads: publicClient }, markets, user.address, FORK_BLOCK)).rejects.toThrow(
        /429/,
      );
    });

    it("reports the failure when only a market's logs cannot be read", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      const logs = logsFailingFor(blueChip.market);

      await expect(discoverPositions({ logs, reads: publicClient }, markets, user.address, FORK_BLOCK)).rejects.toThrow(
        /429/,
      );
    });

    it("a wallet whose positions are all in other pools gets the empty state on this pool's page", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.unlistedPool);
      await givePosition(user.address, POSITIONS.wethUsdgInRange);

      const found = await find(user.address);

      expect(found).toHaveLength(2);
      expect(inPool(found, ETH_USDG.id)).toEqual([]);
    });

    it("says so when the logs cannot be read, instead of reporting a wallet without positions", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      const dead = createPublicClient({
        chain: robinhood,
        transport: http("http://127.0.0.1:9", { retryCount: 0, timeout: 500 }),
      }) as ReadClient;

      await expect(
        discoverPositions({ logs: dead, reads: publicClient }, markets, user.address, FORK_BLOCK),
      ).rejects.toThrow();
    });
  });

  describe("edge case", () => {
    it("a wallet that never held a position has an empty list, not an error", async () => {
      const user = await newUser("newcomer");

      expect(await find(user.address)).toEqual([]);
    });

    it("someone else's collateral is not listed as the wallet's, though the wallet once held the NFT", async () => {
      const first = await newUser("holder");
      const second = await newUser("other");
      await givePosition(first.address, POSITIONS.ethUsdgInRange);
      await givePosition(second.address, POSITIONS.ethUsdgInRange);
      await depositCollateral(second.clients, blueChip, POSITIONS.ethUsdgInRange);

      expect(await find(first.address)).toEqual([]);
      expect(await find(second.address)).toMatchObject([{ tokenId: POSITIONS.ethUsdgInRange, place: "collateral" }]);
    });

    it("collateral taken back is in the wallet again, once, however often it moved", async () => {
      const lender = await newUser("lender");
      await dealUsdg(lender.address, 1_000n * USDG);
      await supply(lender.clients, blueChip, 1_000n * USDG);
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await depositCollateral(user.clients, blueChip, POSITIONS.ethUsdgInRange);
      await withdrawCollateral(user.clients, blueChip, POSITIONS.ethUsdgInRange);
      await depositCollateral(user.clients, blueChip, POSITIONS.ethUsdgInRange);
      await borrow(user.clients, blueChip, POSITIONS.ethUsdgInRange, 20n * USDG);

      expect(await find(user.address)).toMatchObject([
        { tokenId: POSITIONS.ethUsdgInRange, place: "collateral", tier: "blue-chip" },
      ]);
    });

    it("lists the newest position first, which is the row the panel selects", async () => {
      const user = await newUser("holder");
      // Given oldest id last, so the order of arrival is not the order of the list.
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await givePosition(user.address, POSITIONS.wethUsdgInRange);
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);

      expect(idsOf(await find(user.address))).toEqual([
        POSITIONS.ethUsdgInRange, // 1,768,881
        POSITIONS.ethUsdgAboveRange, // 1,621,020
        POSITIONS.wethUsdgInRange, // 999,597
      ]);
    });

    it("lists collateral with the liquidity it holds", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      const held = await liquidityOf(POSITIONS.ethUsdgInRange);
      await depositCollateral(user.clients, blueChip, POSITIONS.ethUsdgInRange);

      // Collateral that holds nothing cannot be made on the fork: the market refuses to empty a
      // position below the pool's minimum. That rule is held by the unit tests of `placeOf`.
      expect(await find(user.address)).toMatchObject([
        { tokenId: POSITIONS.ethUsdgInRange, place: "collateral", liquidity: held },
      ]);
      expect(held).toBeGreaterThan(0n);
    });

    it("reads PositionManager's logs from its deployment block unless told otherwise", () => {
      expect(POSITION_MANAGER_START_BLOCK).toBe(9_073n);
    });
  });
});

describe("the list when the user comes back to the tab", () => {
  isolateEachTest();
  afterEach(() => focusManager.setFocused(undefined));

  /** The query as the pages run it, under the provider's defaults (src/app/providers.tsx). */
  function watch(account: `0x${string}`) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } },
    });
    queryClient.mount();
    const observer = new QueryObserver(queryClient, walletPositionsQuery(clients, markets, account, FORK_BLOCK));
    const seen: { ids: bigint[]; loading: boolean }[] = [];
    const stop = observer.subscribe((result) => {
      seen.push({ ids: idsOf(result.data ?? []), loading: result.isLoading });
    });
    const settled = async () => {
      for (let waited = 0; waited < 200 && observer.getCurrentResult().isFetching; waited++) {
        await new Promise((next) => setTimeout(next, 25));
      }
      return observer.getCurrentResult();
    };
    return {
      seen,
      settled,
      /**
       * The window loses focus and regains it. Waits for the read that follows to land, which is
       * seen on the time of the data and not on `isFetching`: against a local fork a read is over
       * in a few milliseconds.
       */
      leaveAndComeBack: async () => {
        const before = observer.getCurrentResult().dataUpdatedAt;
        await new Promise((next) => setTimeout(next, 5));
        focusManager.setFocused(false);
        focusManager.setFocused(true);
        for (let waited = 0; waited < 200 && observer.getCurrentResult().dataUpdatedAt === before; waited++) {
          await new Promise((next) => setTimeout(next, 25));
        }
        expect(observer.getCurrentResult().dataUpdatedAt, "coming back to the tab read nothing").toBeGreaterThan(before);
      },
      stop: () => {
        stop();
        queryClient.unmount();
      },
    };
  }

  describe("positive", () => {
    it("a position that reached the wallet meanwhile is in the list, with no reload", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);
      const list = watch(user.address);
      expect(idsOf((await list.settled()).data ?? [])).toEqual([POSITIONS.ethUsdgAboveRange]);

      // Seconds later, well inside the 60 s the list counts as fresh.
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await list.leaveAndComeBack();

      expect(idsOf((await list.settled()).data ?? [])).toEqual([POSITIONS.ethUsdgInRange, POSITIONS.ethUsdgAboveRange]);
      list.stop();
    });
  });

  describe("negative", () => {
    it("does not read again by itself while the user stays on the tab", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);
      const list = watch(user.address);
      await list.settled();

      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await new Promise((next) => setTimeout(next, 500));

      expect(idsOf((await list.settled()).data ?? [])).toEqual([POSITIONS.ethUsdgAboveRange]);
      list.stop();
    });
  });

  describe("edge case", () => {
    it("keeps the list on screen while it is read again: loading is the first read only", async () => {
      const user = await newUser("holder");
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);
      const list = watch(user.address);
      await list.settled();
      const first = list.seen.length;
      expect(list.seen.some((result) => result.loading)).toBe(true);

      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      await list.leaveAndComeBack();
      await list.settled();

      const during = list.seen.slice(first);
      expect(during.length).toBeGreaterThan(0);
      expect(during.every((result) => !result.loading)).toBe(true);
      expect(during.every((result) => result.ids.includes(POSITIONS.ethUsdgAboveRange))).toBe(true);
      list.stop();
    });

    it("a position that left the wallet meanwhile is gone from the list", async () => {
      const user = await newUser("holder");
      const other = await newUser("other");
      await givePosition(user.address, POSITIONS.ethUsdgAboveRange);
      await givePosition(user.address, POSITIONS.ethUsdgInRange);
      const list = watch(user.address);
      await list.settled();

      await givePosition(other.address, POSITIONS.ethUsdgInRange);
      await list.leaveAndComeBack();

      expect(idsOf((await list.settled()).data ?? [])).toEqual([POSITIONS.ethUsdgAboveRange]);
      list.stop();
    });
  });
});
