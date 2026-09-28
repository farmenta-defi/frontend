import { createPublicClient, http } from "viem";
import { robinhood } from "viem/chains";
import { describe, expect, it } from "vitest";

import { borrow, depositCollateral, supply, withdrawCollateral } from "@/lib/onchain/actions";
import { discoverPositions, inPool, POSITION_MANAGER_START_BLOCK } from "@/lib/onchain/discovery";
import { feeLabel } from "@/lib/onchain/range";
import { readPosition, type ReadClient } from "@/lib/onchain/reads";

import { ETH_USDG, FORK_BLOCK, POSITIONS, WETH_USDG } from "./support/constants";
import { blueChip, dealUsdg, givePosition, isolateEachTest, meme, newUser, publicClient } from "./support/fork";

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

    it("reads PositionManager's logs from its deployment block unless told otherwise", () => {
      expect(POSITION_MANAGER_START_BLOCK).toBe(9_073n);
    });
  });
});
