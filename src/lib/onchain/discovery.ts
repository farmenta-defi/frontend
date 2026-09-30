import type { Address, Hex } from "viem";

import { chainKeys } from "@/lib/query-keys";
import type { MarketTier } from "@/lib/risk-params";

import { marketAbi, poolIdOf, positionsAbi, type PoolKey } from "./contracts";
import { ticksOf } from "./range";
import type { MarketRefs, ReadClient } from "./reads";

/**
 * Which positions are a wallet's, asked of the chain.
 *
 * PositionManager has no `ERC721Enumerable`, so no call lists a wallet's
 * tokens. Its `Transfer` event indexes `to`, though, and the market's
 * `CollateralDeposited` indexes `owner`, so the logs answer: every position
 * the wallet ever received, and every one it ever deposited. What it has since
 * passed on or taken back drops out when each id is read: `ownerOf` says who
 * holds it now, and `loanOf` whose collateral it is.
 *
 * The logs are read in windows of blocks: the chain's public RPC serves a
 * range of 10,000,000 blocks and no more, and the chain is several times that
 * long.
 *
 * A position whose liquidity was removed stays in the wallet as an NFT until
 * it is burned, and most never are. It is left out: it is worth nothing and
 * the market refuses it (`PositionIsEmpty`). A position the market holds is
 * listed whatever it holds, because its loan and its way out are still there.
 *
 * A user never types a token id (decided by the product owner, review of
 * PR #1). The backend's list (`GET /portfolio/:address`) does not replace this
 * search: the indexer knows a position in a wallet only when it was created
 * after the indexer's first block, and the logs know them all (measured on
 * 30 Sep 2026, see the README).
 */

/** The block PositionManager was deployed in on Robinhood Chain (spec §13): where its logs start. */
export const POSITION_MANAGER_START_BLOCK = 9_073n;

/**
 * The widest range of blocks the chain's public RPC reads logs over in one
 * request. It serves 10,000,000 and refuses 10,000,001 (`-32602`, "query spans
 * ... blocks, but only 10000000 are allowed"), measured on 29 Sep 2026. The
 * chain was past block 75,600,000 by then, so its logs are read in windows.
 */
export const LOG_RANGE_LIMIT = 10_000_000n;

/**
 * The blocks one request asks for. Narrower than the limit by what the chain
 * may grow between the moment its head is asked for and the last request,
 * which reads to `latest` so that a position received a second ago is found.
 */
export const LOG_WINDOW_BLOCKS = LOG_RANGE_LIMIT - 100_000n;

/**
 * The pause between one request for logs and the next, in milliseconds.
 *
 * The public RPC takes about 8 requests sent together and about 3.5 a second
 * after that, and once it has refused one (HTTP 429) it refuses every request
 * of the page for 2 to 4.5 seconds (measured on 29 Sep 2026). So the windows
 * are not asked for together: sent at once, 2 searches of 18 failed; one
 * every 300 ms, none of 16 did.
 */
export const LOG_PAUSE_MS = 300;

export type LogWindow = { fromBlock: bigint; toBlock: bigint | "latest" };

/**
 * The range from `fromBlock` to the chain's head, cut into windows of at most
 * `size` blocks: in order, with no gap and no overlap. The last one reads to
 * `latest` and not to `head`, which is a moment old by the time it is sent.
 */
export function logWindows(fromBlock: bigint, head: bigint, size: bigint = LOG_WINDOW_BLOCKS): LogWindow[] {
  if (size <= 0n) throw new Error("discovery: a window of logs holds at least one block");
  const windows: LogWindow[] = [];
  let from = fromBlock;
  for (; from + size <= head; from += size) windows.push({ fromBlock: from, toBlock: from + size - 1n });
  return [...windows, { fromBlock: from, toBlock: "latest" }];
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Starts `tasks` in order, each one `pauseMs` after the one before and without
 * waiting for its answer, and gives their results in the order of the tasks.
 * The first failure is the failure of the whole, and no task is started after
 * it.
 */
export async function inStep<T>(tasks: readonly (() => Promise<T>)[], pauseMs: number = LOG_PAUSE_MS): Promise<T[]> {
  let failure: { error: unknown } | null = null;
  const started: Promise<T | undefined>[] = [];
  for (const [at, task] of tasks.entries()) {
    if (at > 0 && pauseMs > 0) await pause(pauseMs);
    if (failure) break;
    started.push(
      task().catch((error: unknown) => {
        failure ??= { error };
        return undefined;
      }),
    );
  }
  const results = await Promise.all(started);
  if (failure) throw (failure as { error: unknown }).error;
  return results as T[];
}

export type Discovered = {
  tokenId: bigint;
  /** In the wallet, or held by a market as the wallet's collateral. */
  place: "wallet" | "collateral";
  /** The market holding it. `null` while it is in the wallet. */
  tier: MarketTier | null;
  poolKey: PoolKey;
  poolId: Hex;
  tickLower: number;
  tickUpper: number;
  /** Never zero for a position in the wallet: those are left out. */
  liquidity: bigint;
};

export type DiscoveryClients = {
  /**
   * Reads the logs. It has to serve ranges of `LOG_WINDOW_BLOCKS` blocks, from
   * PositionManager's deployment to now, which a free-tier provider key
   * refuses (10 blocks); the chain's public RPC serves them.
   */
  logs: ReadClient;
  /** Reads the state of each id found. */
  reads: ReadClient;
};

const transfer = positionsAbi.find((entry) => entry.type === "event" && entry.name === "Transfer");
const collateralDeposited = marketAbi.find((entry) => entry.type === "event" && entry.name === "CollateralDeposited");

const same = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();

/** What the chain says about one token id: who holds it, what it holds, and whose loan it backs in each market. */
export type TokenFacts = {
  holder: Address;
  liquidity: bigint;
  /** Per market: the market's address, and the owner of the loan it records for the token. */
  loans: readonly { tier: MarketTier; market: Address; owner: Address }[];
};

/**
 * Where a token is for `account`, or `null` when it is not to be listed.
 *
 * - Held by the account: in the wallet, unless it holds no liquidity. An empty
 *   position is worth nothing and the market refuses it (`PositionIsEmpty`).
 * - Held by a market that records the loan to the account: collateral,
 *   **whatever it holds**. Its loan and its way out are still there, and a
 *   borrower who cannot see the position cannot repay or withdraw it.
 * - Anything else is someone else's.
 */
export function placeOf(
  { holder, liquidity, loans }: TokenFacts,
  account: Address,
): Pick<Discovered, "place" | "tier"> | null {
  if (same(holder, account)) return liquidity > 0n ? { place: "wallet", tier: null } : null;
  const held = loans.find((loan) => same(holder, loan.market) && same(loan.owner, account));
  return held ? { place: "collateral", tier: held.tier } : null;
}

/**
 * Every log that names a token the wallet received or deposited: `Transfer`
 * of PositionManager to the wallet, and `CollateralDeposited` of each market
 * by the wallet.
 *
 * No request asks for more blocks than the RPC serves, whatever the chain's
 * height. A window that cannot be read fails the whole search: a list made of
 * the other windows would silently leave out the positions of that one.
 */
export async function readLogs(
  logs: ReadClient,
  positionManager: Address,
  markets: Record<MarketTier, MarketRefs>,
  account: Address,
  /** The chain's head, as the client that reads the logs has it. */
  head: bigint,
  fromBlock: bigint = POSITION_MANAGER_START_BLOCK,
  size: bigint = LOG_WINDOW_BLOCKS,
  pauseMs: number = LOG_PAUSE_MS,
): Promise<{ args: unknown }[]> {
  if (!transfer || !collateralDeposited) throw new Error("discovery: the pinned ABIs lack Transfer or CollateralDeposited");
  const received = transfer;
  const deposited = collateralDeposited;
  const tiers = Object.keys(markets) as MarketTier[];

  const searches: { from: bigint; read: (window: LogWindow) => Promise<{ args: unknown }[]> }[] = [
    {
      from: fromBlock,
      read: (window) => logs.getLogs({ address: positionManager, event: received, args: { to: account }, ...window }),
    },
    ...tiers.map((tier) => ({
      // Never before `fromBlock`: on a fork the market is deployed after it anyway.
      from: markets[tier].startBlock > fromBlock ? markets[tier].startBlock : fromBlock,
      read: (window: LogWindow) =>
        logs.getLogs({ address: markets[tier].market, event: deposited, args: { owner: account }, ...window }),
    })),
  ];

  const found = await inStep(
    searches.flatMap(({ from, read }) => logWindows(from, head, size).map((window) => () => read(window))),
    pauseMs,
  );
  return found.flat();
}

export async function discoverPositions(
  { logs, reads }: DiscoveryClients,
  markets: Record<MarketTier, MarketRefs>,
  account: Address,
  /** Where PositionManager's logs are read from. Only a fork, which cannot serve the full range, moves it. */
  fromBlock: bigint = POSITION_MANAGER_START_BLOCK,
): Promise<Discovered[]> {
  if (!transfer || !collateralDeposited) throw new Error("discovery: the pinned ABIs lack Transfer or CollateralDeposited");
  const tiers = Object.keys(markets) as MarketTier[];

  const [positionManager, head] = await Promise.all([
    // Both markets are built over the same PositionManager; the address is not written in this repo.
    reads.readContract({ address: markets[tiers[0]].market, abi: marketAbi, functionName: "positionManager" }),
    logs.getBlockNumber({ cacheTime: 0 }),
  ]);

  const ids = new Set<bigint>();
  for (const log of await readLogs(logs, positionManager, markets, account, head, fromBlock)) {
    const tokenId = (log.args as { id?: bigint; tokenId?: bigint }).id ?? (log.args as { tokenId?: bigint }).tokenId;
    if (tokenId !== undefined) ids.add(tokenId);
  }
  if (ids.size === 0) return [];

  // One state, one block. A burned position fails `ownerOf`, so failures are allowed and dropped.
  const tokenIds = [...ids];
  const blockNumber = await reads.getBlockNumber({ cacheTime: 0 });
  const perToken = 3 + tiers.length;
  const results = await reads.multicall({
    blockNumber,
    allowFailure: true,
    batchSize: 16_384,
    contracts: tokenIds.flatMap((tokenId) => [
      { address: positionManager, abi: positionsAbi, functionName: "ownerOf", args: [tokenId] } as const,
      { address: positionManager, abi: positionsAbi, functionName: "getPoolAndPositionInfo", args: [tokenId] } as const,
      { address: positionManager, abi: positionsAbi, functionName: "getPositionLiquidity", args: [tokenId] } as const,
      ...tiers.map(
        (tier) => ({ address: markets[tier].market, abi: marketAbi, functionName: "loanOf", args: [tokenId] }) as const,
      ),
    ]),
  });

  const found: Discovered[] = [];
  tokenIds.forEach((tokenId, index) => {
    const [owner, info, held, ...loans] = results.slice(index * perToken, (index + 1) * perToken);
    if (owner.status !== "success" || info.status !== "success" || held.status !== "success") return;

    const holder = owner.result as Address;
    const [key, packed] = info.result as readonly [PoolKey, bigint];
    const poolKey: PoolKey = { ...key };
    const liquidity = held.result as bigint;
    const position = { tokenId, poolKey, poolId: poolIdOf(poolKey), ...ticksOf(packed), liquidity };

    const where = placeOf(
      {
        holder,
        liquidity,
        loans: tiers.flatMap((tier, at) => {
          const loan = loans[at];
          return loan.status === "success"
            ? [{ tier, market: markets[tier].market, owner: (loan.result as { owner: Address }).owner }]
            : [];
        }),
      },
      account,
    );
    if (where) found.push({ ...position, ...where });
  });

  // Newest first: a token id only grows, and the position someone just opened is the one they came for.
  return found.sort((a, b) => (a.tokenId < b.tokenId ? 1 : a.tokenId > b.tokenId ? -1 : 0));
}

/** How long a list counts as fresh. Coming back to the tab reads it again whatever its age. */
const FRESH_MS = 60_000;

/**
 * The query that finds a wallet's positions, as the pages run it.
 *
 * It reads again whenever the window regains focus, however fresh the list is:
 * a user opens a position on Uniswap in another tab and comes back, and the
 * position has to be there without a reload. Only this query does so; the
 * other reads refresh on an interval. It does not retry: the transport of the
 * logs already tried four times.
 */
export function walletPositionsQuery(
  clients: DiscoveryClients,
  markets: Record<MarketTier, MarketRefs>,
  account: Address,
  fromBlock: bigint = POSITION_MANAGER_START_BLOCK,
) {
  return {
    queryKey: chainKeys.positions(account),
    queryFn: () => discoverPositions(clients, markets, account, fromBlock),
    retry: false,
    staleTime: FRESH_MS,
    refetchOnWindowFocus: "always",
  } as const;
}

export const inPool = (positions: readonly Discovered[], poolId: Hex) =>
  positions.filter((position) => position.poolId.toLowerCase() === poolId.toLowerCase());
