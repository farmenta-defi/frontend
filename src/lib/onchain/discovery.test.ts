import { createPublicClient, custom, encodeEventTopics, type Address, type EIP1193RequestFn, type Hex } from "viem";
import { robinhood } from "viem/chains";
import { afterEach, describe, expect, it, vi } from "vitest";

import { marketAbi, positionsAbi } from "./contracts";
import {
  inStep,
  LOG_RANGE_LIMIT,
  LOG_WINDOW_BLOCKS,
  logWindows,
  placeOf,
  POSITION_MANAGER_START_BLOCK,
  readLogs,
  type TokenFacts,
} from "./discovery";
import type { MarketRefs, ReadClient } from "./reads";

const ALICE = "0x00000000000000000000000000000000000A11CE";
const BOB = "0x0000000000000000000000000000000000000B0B";
const BLUE_CHIP = "0x00000000000000000000000000000000000000b1";
const MEME = "0x00000000000000000000000000000000000000b2";
const NOBODY = "0x0000000000000000000000000000000000000000";

/** A token as the chain describes it: no market records a loan for it unless a test says so. */
const token = (over: Partial<TokenFacts> = {}): TokenFacts => ({
  holder: ALICE,
  liquidity: 1_000n,
  loans: [
    { tier: "blue-chip", market: BLUE_CHIP, owner: NOBODY },
    { tier: "meme", market: MEME, owner: NOBODY },
  ],
  ...over,
});

const heldBy = (market: string, owner: string, liquidity = 1_000n) =>
  token({
    holder: market as `0x${string}`,
    liquidity,
    loans: [
      { tier: "blue-chip", market: BLUE_CHIP, owner: (market === BLUE_CHIP ? owner : NOBODY) as `0x${string}` },
      { tier: "meme", market: MEME, owner: (market === MEME ? owner : NOBODY) as `0x${string}` },
    ],
  });

describe("placeOf", () => {
  describe("positive", () => {
    it("a position the wallet holds, with liquidity, is in the wallet", () => {
      expect(placeOf(token(), ALICE)).toEqual({ place: "wallet", tier: null });
    });

    it("a position a market holds for the wallet is that market's collateral", () => {
      expect(placeOf(heldBy(BLUE_CHIP, ALICE), ALICE)).toEqual({ place: "collateral", tier: "blue-chip" });
      expect(placeOf(heldBy(MEME, ALICE), ALICE)).toEqual({ place: "collateral", tier: "meme" });
    });
  });

  describe("negative", () => {
    it("a position in the wallet that holds no liquidity is not listed", () => {
      expect(placeOf(token({ liquidity: 0n }), ALICE)).toBeNull();
    });

    it("someone else's position and someone else's collateral are not listed", () => {
      expect(placeOf(token({ holder: BOB }), ALICE)).toBeNull();
      expect(placeOf(heldBy(BLUE_CHIP, BOB), ALICE)).toBeNull();
    });
  });

  describe("edge case", () => {
    it("collateral that holds no liquidity is listed: its loan and its way out are still there", () => {
      expect(placeOf(heldBy(BLUE_CHIP, ALICE, 0n), ALICE)).toEqual({ place: "collateral", tier: "blue-chip" });
      expect(placeOf(heldBy(MEME, ALICE, 0n), ALICE)).toEqual({ place: "collateral", tier: "meme" });
    });

    it("a position a market holds without a loan recorded to anyone is not the wallet's", () => {
      // Minted or sent straight to the market: `loanOf` is a zeroed record.
      expect(placeOf(heldBy(BLUE_CHIP, NOBODY), ALICE)).toBeNull();
    });

    it("a loan recorded by one market does not make collateral of a token the other market holds", () => {
      const crossed = token({
        holder: MEME,
        loans: [
          { tier: "blue-chip", market: BLUE_CHIP, owner: ALICE },
          { tier: "meme", market: MEME, owner: NOBODY },
        ],
      });
      expect(placeOf(crossed, ALICE)).toBeNull();
    });

    it("compares addresses whatever their case", () => {
      const lower = ALICE.toLowerCase() as `0x${string}`;
      expect(placeOf(token({ holder: lower }), ALICE)).toEqual({ place: "wallet", tier: null });
      const held = token({
        holder: BLUE_CHIP.toUpperCase().replace("0X", "0x") as `0x${string}`,
        loans: [{ tier: "blue-chip", market: BLUE_CHIP, owner: lower }],
      });
      expect(placeOf(held, ALICE)).toEqual({ place: "collateral", tier: "blue-chip" });
    });

    it("a market whose read failed is left out, and the token is judged by the others", () => {
      const partial = token({ holder: MEME, loans: [{ tier: "meme", market: MEME, owner: ALICE }] });
      expect(placeOf(partial, ALICE)).toEqual({ place: "collateral", tier: "meme" });
    });
  });
});

/** The chain's height when the public RPC began refusing the search, 29 Sep 2026. */
const HEAD = 75_648_827n;

const spanOf = ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint | "latest" }, head: bigint) =>
  (toBlock === "latest" ? head : toBlock) - fromBlock + 1n;

describe("logWindows", () => {
  describe("positive", () => {
    it("cuts the chain since PositionManager's deployment into windows the RPC serves", () => {
      const windows = logWindows(POSITION_MANAGER_START_BLOCK, HEAD);

      expect(windows).toHaveLength(8);
      expect(windows.every((window) => spanOf(window, HEAD) <= LOG_WINDOW_BLOCKS)).toBe(true);
    });

    it("leaves no block out and reads none twice", () => {
      const windows = logWindows(POSITION_MANAGER_START_BLOCK, HEAD);

      expect(windows[0].fromBlock).toBe(POSITION_MANAGER_START_BLOCK);
      windows.slice(1).forEach((window, at) => expect(window.fromBlock).toBe((windows[at].toBlock as bigint) + 1n));
      expect(windows.at(-1)!.toBlock).toBe("latest");
    });

    it("keeps the last window inside the limit while the chain grows by 100,000 blocks", () => {
      // The widest the last window can be: one block short of a window of its own.
      const head = POSITION_MANAGER_START_BLOCK + 3n * LOG_WINDOW_BLOCKS - 1n;
      const last = logWindows(POSITION_MANAGER_START_BLOCK, head).at(-1)!;

      expect(spanOf(last, head)).toBe(LOG_WINDOW_BLOCKS);
      expect(spanOf(last, head + 100_000n)).toBeLessThanOrEqual(LOG_RANGE_LIMIT);
    });
  });

  describe("negative", () => {
    it("refuses a window that holds no block", () => {
      expect(() => logWindows(0n, 100n, 0n)).toThrow(/at least one block/);
      expect(() => logWindows(0n, 100n, -5n)).toThrow(/at least one block/);
    });
  });

  describe("edge case", () => {
    it("a range shorter than a window is one request, to latest", () => {
      expect(logWindows(74_904_517n, HEAD)).toEqual([{ fromBlock: 74_904_517n, toBlock: "latest" }]);
    });

    it("a start past the head is one request: the node answers with no logs", () => {
      expect(logWindows(200n, 100n)).toEqual([{ fromBlock: 200n, toBlock: "latest" }]);
    });

    it("a head on the first block of a window gives that block a window", () => {
      expect(logWindows(0n, 20n, 10n)).toEqual([
        { fromBlock: 0n, toBlock: 9n },
        { fromBlock: 10n, toBlock: 19n },
        { fromBlock: 20n, toBlock: "latest" },
      ]);
    });

    it("a head on the last block of a window leaves that window to read to latest", () => {
      expect(logWindows(0n, 19n, 10n)).toEqual([
        { fromBlock: 0n, toBlock: 9n },
        { fromBlock: 10n, toBlock: "latest" },
      ]);
    });
  });
});

describe("inStep", () => {
  afterEach(() => vi.useRealTimers());

  /** A task that reports when it started and answers after `takes` ms. */
  const task =
    <T>(answer: T, takes: number, started: number[]) =>
    () => {
      started.push(Date.now());
      return new Promise<T>((done) => setTimeout(() => done(answer), takes));
    };
  const failing = (message: string, takes: number, started: number[]) => () => {
    started.push(Date.now());
    return new Promise<never>((_, fail) => setTimeout(() => fail(new Error(message)), takes));
  };

  describe("positive", () => {
    it("starts one task every pause, without waiting for the answer of the one before", async () => {
      vi.useFakeTimers();
      const started: number[] = [];
      const begun = Date.now();

      const run = inStep([task("a", 5_000, started), task("b", 5_000, started), task("c", 5_000, started)], 300);
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(run).resolves.toEqual(["a", "b", "c"]);
      expect(started.map((at) => at - begun)).toEqual([0, 300, 600]);
    });

    it("gives the results in the order of the tasks, whichever answers first", async () => {
      vi.useFakeTimers();
      const run = inStep([task("slow", 900, []), task("fast", 10, []), task("middle", 200, [])], 50);
      await vi.advanceTimersByTimeAsync(2_000);

      await expect(run).resolves.toEqual(["slow", "fast", "middle"]);
    });
  });

  describe("negative", () => {
    it("fails with the first failure and starts nothing after it", async () => {
      vi.useFakeTimers();
      const started: number[] = [];
      const run = inStep(
        [task("a", 10, started), failing("HTTP 429", 10, started), task("c", 10, started), task("d", 10, started)],
        300,
      );
      const outcome = expect(run).rejects.toThrow("HTTP 429");
      await vi.advanceTimersByTimeAsync(5_000);

      await outcome;
      // The failure came at 310 ms: the third task had started at 600 ms otherwise.
      expect(started).toHaveLength(2);
    });

    it("reports the failure though tasks started before it have answered", async () => {
      vi.useFakeTimers();
      const run = inStep([task("a", 10, []), task("b", 10, []), failing("timed out", 10, [])], 100);
      const outcome = expect(run).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(5_000);

      await outcome;
    });
  });

  describe("edge case", () => {
    it("no task is no result, at once", async () => {
      await expect(inStep([], 300)).resolves.toEqual([]);
    });

    it("one task does not wait", async () => {
      vi.useFakeTimers();
      const started: number[] = [];
      const begun = Date.now();
      const run = inStep([task("only", 0, started)], 300);
      await vi.advanceTimersByTimeAsync(1);

      await expect(run).resolves.toEqual(["only"]);
      expect(started[0] - begun).toBe(0);
    });

    it("two failures under way are one failure, the first", async () => {
      vi.useFakeTimers();
      const run = inStep([failing("second to fail", 900, []), failing("first to fail", 100, [])], 50);
      const outcome = expect(run).rejects.toThrow("first to fail");
      await vi.advanceTimersByTimeAsync(5_000);

      await outcome;
    });
  });
});

describe("readLogs", () => {
  const POSITION_MANAGER = "0x58daec3116aae6D93017bAAea7749052E8a04fA7";
  // Lower case: viem encodes an address of mixed case only when it is its checksum.
  const alice = ALICE.toLowerCase() as Address;
  const bob = BOB.toLowerCase() as Address;
  const markets: Record<"blue-chip" | "meme", MarketRefs> = {
    "blue-chip": { market: BLUE_CHIP, startBlock: 74_904_517n, lens: NOBODY, policy: NOBODY },
    meme: { market: MEME, startBlock: 74_904_522n, lens: NOBODY, policy: NOBODY },
  };

  type Stored = { address: Address; topics: Hex[]; blockNumber: bigint };
  const received = (tokenId: bigint, to: Address, blockNumber: bigint): Stored => ({
    address: POSITION_MANAGER,
    topics: encodeEventTopics({ abi: positionsAbi, eventName: "Transfer", args: { from: NOBODY, to, tokenId } }) as Hex[],
    blockNumber,
  });
  const deposited = (tokenId: bigint, owner: Address, market: Address, blockNumber: bigint): Stored => ({
    address: market,
    topics: encodeEventTopics({ abi: marketAbi, eventName: "CollateralDeposited", args: { tokenId, owner } }) as Hex[],
    blockNumber,
  });

  type Asked = { address: Address; fromBlock: bigint; toBlock: bigint | "latest" };

  /**
   * A node that answers `eth_getLogs` the way the chain's public RPC does: a
   * range of more than 10,000,000 blocks is refused with its words, and
   * `latest` is the chain's height at that moment.
   */
  function node(
    stored: readonly Stored[],
    { latest = HEAD, refuses }: { latest?: bigint; refuses?: (question: Asked) => boolean } = {},
  ) {
    const asked: Asked[] = [];
    const request = (async ({ method, params }) => {
      if (method !== "eth_getLogs") throw new Error(`the search asked for ${method}`);
      const [filter] = params as [{ address: Address; topics: (Hex | null)[]; fromBlock: Hex; toBlock: Hex | "latest" }];
      const question: Asked = {
        address: filter.address,
        fromBlock: BigInt(filter.fromBlock),
        toBlock: filter.toBlock === "latest" ? "latest" : BigInt(filter.toBlock),
      };
      asked.push(question);
      const to = question.toBlock === "latest" ? latest : question.toBlock;
      const spans = to - question.fromBlock + 1n;
      if (spans > 10_000_000n) {
        throw Object.assign(new Error("invalid params"), {
          code: -32602,
          message: `query spans ${spans} blocks (${question.fromBlock} to ${to}), but only 10000000 are allowed for this request; narrow the block range`,
        });
      }
      if (refuses?.(question)) throw new Error("HTTP 429: Too Many Requests");
      return stored
        .filter(
          (log) =>
            same(log.address, filter.address) &&
            log.blockNumber >= question.fromBlock &&
            log.blockNumber <= to &&
            filter.topics.every((topic, at) => topic === null || topic.toLowerCase() === log.topics[at]?.toLowerCase()),
        )
        .map((log, at) => ({
          address: log.address,
          topics: log.topics,
          data: "0x",
          blockNumber: `0x${log.blockNumber.toString(16)}`,
          blockHash: `0x${"11".repeat(32)}`,
          transactionHash: `0x${"22".repeat(32)}`,
          transactionIndex: "0x0",
          logIndex: `0x${at.toString(16)}`,
          removed: false,
        }));
    }) as EIP1193RequestFn;
    const client = createPublicClient({ chain: robinhood, transport: custom({ request }, { retryCount: 0 }) });
    return { client: client as ReadClient, asked };
  }
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const idsOf = (logs: readonly { args: unknown }[]) =>
    logs.map((log) => (log.args as { id?: bigint; tokenId?: bigint }).id ?? (log.args as { tokenId?: bigint }).tokenId);
  const search = (client: ReadClient, head = HEAD, size = LOG_WINDOW_BLOCKS) =>
    readLogs(client, POSITION_MANAGER, markets, alice, head, POSITION_MANAGER_START_BLOCK, size, 0);

  describe("positive", () => {
    it("finds what the wallet received anywhere on a chain seven times longer than the RPC reads at once", async () => {
      const { client, asked } = node([
        received(12n, alice, 9_073n),
        received(3_024_042n, alice, 64_120_000n),
        received(3_402_463n, alice, 75_500_000n),
        received(999n, bob, 40_000_000n),
      ]);

      const found = await search(client);

      expect(idsOf(found).sort()).toEqual([12n, 3_024_042n, 3_402_463n].sort());
      expect(asked.every((question) => spanOf(question, HEAD) <= LOG_RANGE_LIMIT)).toBe(true);
      expect(asked.filter((question) => same(question.address, POSITION_MANAGER))).toHaveLength(8);
    });

    it("finds what the wallet deposited, reading each market from the block it was deployed in", async () => {
      const { client, asked } = node([
        deposited(3_402_463n, alice, BLUE_CHIP, 75_000_000n),
        deposited(3_400_223n, alice, MEME, 75_100_000n),
        deposited(777n, bob, MEME, 75_100_001n),
      ]);

      const found = await search(client);

      expect(idsOf(found).sort()).toEqual([3_400_223n, 3_402_463n]);
      expect(asked.filter((question) => same(question.address, BLUE_CHIP))).toEqual([
        { address: expect.any(String), fromBlock: 74_904_517n, toBlock: "latest" },
      ]);
      expect(asked.filter((question) => same(question.address, MEME))).toEqual([
        { address: expect.any(String), fromBlock: 74_904_522n, toBlock: "latest" },
      ]);
    });
  });

  describe("negative", () => {
    it("the one request the app sent before is refused by the node, in the RPC's words", async () => {
      const { client } = node([received(3_402_463n, alice, 75_500_000n)]);

      // One window as long as the chain: what `fromBlock: 9073, toBlock: "latest"` asked for.
      await expect(search(client, HEAD, HEAD)).rejects.toThrow(/only 10000000 are allowed/);
    });

    it("fails when one window cannot be read, though the others answer", async () => {
      const { client } = node([received(3_402_463n, alice, 75_500_000n)], {
        refuses: ({ address, fromBlock }) => same(address, POSITION_MANAGER) && fromBlock === 9_073n + 2n * LOG_WINDOW_BLOCKS,
      });

      // The position is in a window that answered. Listing it alone would leave out the refused window's.
      await expect(search(client)).rejects.toThrow(/429/);
    });

    it("fails when a market's logs cannot be read", async () => {
      const { client } = node([received(3_402_463n, alice, 75_500_000n)], {
        refuses: ({ address }) => same(address, MEME),
      });

      await expect(search(client)).rejects.toThrow(/429/);
    });
  });

  describe("edge case", () => {
    it("finds a position received after the head was read: the last window reads to latest", async () => {
      const { client } = node([received(3_500_000n, alice, HEAD + 40n)], { latest: HEAD + 40n });

      expect(idsOf(await search(client, HEAD))).toEqual([3_500_000n]);
    });

    it("a wallet that received nothing has no logs, and every window was read to say so", async () => {
      const { client, asked } = node([received(999n, bob, 40_000_000n)]);

      expect(await search(client)).toEqual([]);
      expect(asked).toHaveLength(10);
    });

    it("a token received twice is two logs: the ids are counted once by the search", async () => {
      const { client } = node([received(3_402_463n, alice, 70_000_000n), received(3_402_463n, alice, 75_000_000n)]);

      expect(idsOf(await search(client))).toEqual([3_402_463n, 3_402_463n]);
    });

    it("reads in one request on a fork, whose logs start at its block", async () => {
      const { client, asked } = node([received(3_402_463n, alice, 75_422_300n)], { latest: 75_422_400n });

      const found = await readLogs(client, POSITION_MANAGER, markets, alice, 75_422_400n, 75_422_200n, LOG_WINDOW_BLOCKS, 0);

      expect(idsOf(found)).toEqual([3_402_463n]);
      expect(asked).toHaveLength(3);
      expect(asked.every((question) => question.fromBlock === 75_422_200n && question.toBlock === "latest")).toBe(true);
    });
  });
});
