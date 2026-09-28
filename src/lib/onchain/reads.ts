import {
  encodeFunctionData,
  decodeFunctionResult,
  erc20Abi,
  multicall3Abi,
  zeroAddress,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

import { chain } from "@/lib/chain";

import { lensAbi, marketAbi, policyAbi, poolIdOf, positionsAbi, type PoolKey } from "./contracts";
import { explainError, type Explained } from "./errors";

/**
 * The reads a transaction is decided on, taken from the chain through the
 * browser's RPC at the moment the user is about to sign (FAR-72). Backend
 * figures may be 30 seconds old plus the indexer's lag; that is fine to show
 * and not fine to size a transaction with, so none of these come from there.
 *
 * Every function reads at one block, so the figures of one state agree with
 * each other.
 */
export type ReadClient = PublicClient<Transport, Chain>;
export type Clients = { publicClient: ReadClient; walletClient: WalletClient<Transport, Chain, Account> };

/**
 * The block every read of one state is taken at. Asked for afresh each time:
 * viem would otherwise answer from a cache a few seconds old, and these
 * figures are read because a user is about to sign.
 */
const latestBlock = (client: ReadClient) => client.getBlockNumber({ cacheTime: 0 });

/** One market and what belongs to it, as `deployment` gives them. */
export type MarketRefs = {
  market: Address;
  /** The block the market was deployed in, from the manifest: where its logs start. */
  startBlock: bigint;
  lens: Address;
  policy: Address;
};

export type LenderState = {
  /** USDG, as the market reports it (`asset()`). */
  asset: Address;
  /** USDG in the wallet. */
  balance: bigint;
  /** USDG the wallet has approved the market to pull. */
  allowance: bigint;
  /** What the wallet's shares are worth, in USDG. */
  deposited: bigint;
  /** What `withdraw` accepts right now: the deposit or the market's idle cash, whichever is lower. */
  maxWithdraw: bigint;
  /** USDG sitting idle in the market. */
  cash: bigint;
  paused: boolean;
};

export async function readLenderState(client: ReadClient, market: Address, account: Address): Promise<LenderState> {
  const blockNumber = await latestBlock(client);
  const at = { blockNumber } as const;
  const read = { address: market, abi: marketAbi, ...at } as const;

  const asset = await client.readContract({ ...read, functionName: "asset" });
  const token = { address: asset, abi: erc20Abi, ...at } as const;
  const [balance, allowance, shares, maxWithdraw, cash, paused] = await Promise.all([
    client.readContract({ ...token, functionName: "balanceOf", args: [account] }),
    client.readContract({ ...token, functionName: "allowance", args: [account, market] }),
    client.readContract({ ...read, functionName: "balanceOf", args: [account] }),
    client.readContract({ ...read, functionName: "maxWithdraw", args: [account] }),
    client.readContract({ ...token, functionName: "balanceOf", args: [market] }),
    client.readContract({ ...read, functionName: "paused" }),
  ]);
  const deposited = shares === 0n ? 0n : await client.readContract({ ...read, functionName: "convertToAssets", args: [shares] });

  return { asset, balance, allowance, deposited, maxWithdraw, cash, paused };
}

/** Whether a pool takes new collateral and new loans. */
export type PoolStatus = "open" | "frozen" | "unlisted";

/** What the pool lends on. Absent for a pool that is not listed. */
export type PoolTerms = { maxLtvBps: number; ltBps: number };

export async function readPool(
  client: ReadClient,
  policy: Address,
  poolId: Hex,
  blockNumber?: bigint,
): Promise<{ status: PoolStatus; terms: PoolTerms | null }> {
  const at = { blockNumber: blockNumber ?? (await latestBlock(client)) } as const;
  const read = { address: policy, abi: policyAbi, ...at } as const;

  // `termsOf` reverts for a pool that is not listed; that is the only way to tell
  // "frozen" from "never listed", which `acceptsNewPositions` reports alike.
  const [accepts, terms] = await Promise.all([
    client.readContract({ ...read, functionName: "acceptsNewPositions", args: [poolId] }),
    client.readContract({ ...read, functionName: "termsOf", args: [poolId] }).catch((error: unknown) => {
      if (explainError(error).code === "PoolNotListed") return null;
      throw error;
    }),
  ]);
  if (!terms) return { status: "unlisted", terms: null };
  return { status: accepts ? "open" : "frozen", terms: { maxLtvBps: terms.maxLtvBps, ltBps: terms.ltBps } };
}

/**
 * The debt of a loan as of now, interest since the market's last accrual
 * included. `debtOf` answers at the index stored by the last transaction, so
 * on a market nobody has touched for a week it is a week short, and a full
 * repayment approved for that figure would not cover the debt.
 *
 * Read by running `accrue()` and then `debtOf` inside one `eth_call` through
 * Multicall3. Nothing is sent; the accrual exists only in the simulation.
 */
export async function readCurrentDebt(
  client: ReadClient,
  market: Address,
  tokenId: bigint,
  blockNumber?: bigint,
): Promise<bigint> {
  const multicall = chain.contracts?.multicall3?.address;
  const debtOf = { abi: marketAbi, functionName: "debtOf", args: [tokenId] } as const;
  if (!multicall) return client.readContract({ address: market, ...debtOf, blockNumber });

  const { result } = await client.simulateContract({
    address: multicall,
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [
      [
        { target: market, allowFailure: false, callData: encodeFunctionData({ abi: marketAbi, functionName: "accrue" }) },
        { target: market, allowFailure: false, callData: encodeFunctionData(debtOf) },
      ],
    ],
    blockNumber,
  });
  const [, debt] = result as readonly { success: boolean; returnData: Hex }[];
  return decodeFunctionResult({ ...debtOf, data: debt.returnData });
}

/** Where a position NFT is, from the point of view of `account`. */
export type PositionPlace =
  /** In `account`'s wallet: it can be deposited. */
  | "wallet"
  /** Held by this market as `account`'s collateral. */
  | "collateral"
  /** Held by someone else, or by this market for someone else. */
  | "elsewhere"
  /** No such token: never minted, or burned. */
  | "missing";

/** The price-dependent half of a loan. The lens cannot answer it when a price is unavailable. */
export type LoanRisk = {
  /** Collateral value the market lends against, USD 1e18: principal plus capped fees, after the haircut. */
  positionValue: bigint;
  /** More USDG the loan can take before max LTV. */
  maxBorrow: bigint;
  /** 1e18, or `type(uint256).max` without debt. */
  healthFactor: bigint;
};

export type PositionState = {
  tokenId: bigint;
  place: PositionPlace;
  /** The pool the position provides liquidity to. Absent when the token is missing. */
  poolId: Hex | null;
  poolKey: PoolKey | null;
  pool: { status: PoolStatus; terms: PoolTerms | null };
  paused: boolean;
  /** USDG owed as of now. Zero unless `place` is "collateral". */
  debt: bigint;
  risk: LoanRisk | null;
  /** Why `risk` is absent although the position is collateral: a stale feed, for one. */
  riskError: Explained | null;
  /** For repaying: USDG in the wallet and what the market may pull of it. */
  asset: Address;
  balance: bigint;
  allowance: bigint;
};

export async function readPosition(
  client: ReadClient,
  refs: MarketRefs,
  tokenId: bigint,
  account: Address,
): Promise<PositionState> {
  const blockNumber = await latestBlock(client);
  const at = { blockNumber } as const;
  const market = { address: refs.market, abi: marketAbi, ...at } as const;
  const lens = { address: refs.lens, abi: lensAbi, ...at } as const;

  const [positionManager, asset, paused, loan] = await Promise.all([
    client.readContract({ ...market, functionName: "positionManager" }),
    client.readContract({ ...market, functionName: "asset" }),
    client.readContract({ ...market, functionName: "paused" }),
    client.readContract({ ...market, functionName: "loanOf", args: [tokenId] }),
  ]);
  const positions = { address: positionManager, abi: positionsAbi, ...at } as const;
  const token = { address: asset, abi: erc20Abi, ...at } as const;

  const [holder, balance, allowance] = await Promise.all([
    // solmate's `ownerOf` reverts for a token that does not exist.
    client.readContract({ ...positions, functionName: "ownerOf", args: [tokenId] }).catch(() => null),
    client.readContract({ ...token, functionName: "balanceOf", args: [account] }),
    client.readContract({ ...token, functionName: "allowance", args: [account, refs.market] }),
  ]);

  const base = { tokenId, paused, asset, balance, allowance, debt: 0n, risk: null, riskError: null } as const;
  if (!holder || holder === zeroAddress) {
    return { ...base, place: "missing", poolId: null, poolKey: null, pool: { status: "unlisted", terms: null } };
  }

  const [key] = await client.readContract({ ...positions, functionName: "getPoolAndPositionInfo", args: [tokenId] });
  const poolKey: PoolKey = { ...key };
  const poolId = poolIdOf(poolKey);
  const pool = await readPool(client, refs.policy, poolId, blockNumber);

  const same = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();
  const place: PositionPlace = same(holder, account)
    ? "wallet"
    : same(holder, refs.market) && same(loan.owner, account)
      ? "collateral"
      : "elsewhere";
  if (place !== "collateral") return { ...base, place, poolId, poolKey, pool };

  const debt = await readCurrentDebt(client, refs.market, tokenId, blockNumber);
  try {
    const [positionValue, maxBorrow, healthFactor] = await Promise.all([
      client.readContract({ ...lens, functionName: "positionValue", args: [tokenId] }),
      client.readContract({ ...lens, functionName: "maxBorrow", args: [tokenId] }),
      client.readContract({ ...lens, functionName: "healthFactor", args: [tokenId] }),
    ]);
    return { ...base, place, poolId, poolKey, pool, debt, risk: { positionValue, maxBorrow, healthFactor } };
  } catch (error) {
    // The debt is still known, so repaying and withdrawing stay possible without a price.
    return { ...base, place, poolId, poolKey, pool, debt, riskError: explainError(error) };
  }
}
