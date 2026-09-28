import type { Address, Hex } from "viem";

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
 * A user never types a token id (decided by the product owner, review of
 * PR #1). When the backend's list is there (FAR-71) it comes first, and this is
 * what is left when the backend is down.
 */

/** The block PositionManager was deployed in on Robinhood Chain (spec §13): where its logs start. */
export const POSITION_MANAGER_START_BLOCK = 9_073n;

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
};

export type DiscoveryClients = {
  /**
   * Reads the logs. It has to serve a range from PositionManager's deployment
   * to now, which a free-tier provider key refuses (10 blocks); the chain's
   * public RPC serves it.
   */
  logs: ReadClient;
  /** Reads the state of each id found. */
  reads: ReadClient;
};

const transfer = positionsAbi.find((entry) => entry.type === "event" && entry.name === "Transfer");
const collateralDeposited = marketAbi.find((entry) => entry.type === "event" && entry.name === "CollateralDeposited");

const same = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();

export async function discoverPositions(
  { logs, reads }: DiscoveryClients,
  markets: Record<MarketTier, MarketRefs>,
  account: Address,
  /** Where PositionManager's logs are read from. Only a fork, which cannot serve the full range, moves it. */
  fromBlock: bigint = POSITION_MANAGER_START_BLOCK,
): Promise<Discovered[]> {
  if (!transfer || !collateralDeposited) throw new Error("discovery: the pinned ABIs lack Transfer or CollateralDeposited");
  const tiers = Object.keys(markets) as MarketTier[];

  // Both markets are built over the same PositionManager; the address is not written in this repo.
  const positionManager = await reads.readContract({
    address: markets[tiers[0]].market,
    abi: marketAbi,
    functionName: "positionManager",
  });

  const [received, ...deposited] = await Promise.all([
    logs.getLogs({ address: positionManager, event: transfer, args: { to: account }, fromBlock, toBlock: "latest" }),
    ...tiers.map((tier) =>
      logs.getLogs({
        address: markets[tier].market,
        event: collateralDeposited,
        args: { owner: account },
        // Never before `fromBlock`: on a fork the market is deployed after it anyway.
        fromBlock: markets[tier].startBlock > fromBlock ? markets[tier].startBlock : fromBlock,
        toBlock: "latest",
      }),
    ),
  ]);

  const ids = new Set<bigint>();
  for (const log of [...received, ...deposited.flat()]) {
    const tokenId = (log.args as { id?: bigint; tokenId?: bigint }).id ?? (log.args as { tokenId?: bigint }).tokenId;
    if (tokenId !== undefined) ids.add(tokenId);
  }
  if (ids.size === 0) return [];

  // One state, one block. A burned position fails `ownerOf`, so failures are allowed and dropped.
  const tokenIds = [...ids];
  const blockNumber = await reads.getBlockNumber({ cacheTime: 0 });
  const perToken = 2 + tiers.length;
  const results = await reads.multicall({
    blockNumber,
    allowFailure: true,
    batchSize: 16_384,
    contracts: tokenIds.flatMap((tokenId) => [
      { address: positionManager, abi: positionsAbi, functionName: "ownerOf", args: [tokenId] } as const,
      { address: positionManager, abi: positionsAbi, functionName: "getPoolAndPositionInfo", args: [tokenId] } as const,
      ...tiers.map(
        (tier) => ({ address: markets[tier].market, abi: marketAbi, functionName: "loanOf", args: [tokenId] }) as const,
      ),
    ]),
  });

  const found: Discovered[] = [];
  tokenIds.forEach((tokenId, index) => {
    const [owner, info, ...loans] = results.slice(index * perToken, (index + 1) * perToken);
    if (owner.status !== "success" || info.status !== "success") return;

    const holder = owner.result as Address;
    const [key, packed] = info.result as readonly [PoolKey, bigint];
    const poolKey: PoolKey = { ...key };
    const position = { tokenId, poolKey, poolId: poolIdOf(poolKey), ...ticksOf(packed) };

    if (same(holder, account)) return found.push({ ...position, place: "wallet", tier: null });
    tiers.forEach((tier, at) => {
      const loan = loans[at];
      if (loan.status !== "success" || !same(holder, markets[tier].market)) return;
      if (same((loan.result as { owner: Address }).owner, account)) found.push({ ...position, place: "collateral", tier });
    });
  });

  // Newest first: a token id only grows, and the position someone just opened is the one they came for.
  return found.sort((a, b) => (a.tokenId < b.tokenId ? 1 : a.tokenId > b.tokenId ? -1 : 0));
}

export const inPool = (positions: readonly Discovered[], poolId: Hex) =>
  positions.filter((position) => position.poolId.toLowerCase() === poolId.toLowerCase());
