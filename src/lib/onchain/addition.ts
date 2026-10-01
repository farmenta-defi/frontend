import { erc20Abi, type Address, type Hex } from "viem";

import { permit2Abi } from "@/abis/Permit2";
import { positionValuerAbi } from "@/abis/PositionValuer";
import { stateViewAbi } from "@/abis/StateView";
import { chain } from "@/lib/chain";

import { marketAbi, poolIdOf, positionsAbi, type PoolKey } from "./contracts";
import { ActionError } from "./errors";
import { amountsToAdd, type PoolPrice, type Range } from "./liquidity-math";
import { isNative, ticksOf } from "./range";
import type { Clients, ReadClient } from "./reads";

/**
 * Adding liquidity to a deposited position (FAR-66): how much, what it costs
 * at the pool's price, and the Permit2 permit the tokens are pulled with.
 *
 * The amount is a share of the liquidity the position already holds, so the
 * same choice works for a position in its range, which takes both tokens, and
 * for one outside it, which takes one.
 */
export const ADDITION_SHARES = [25, 50, 100] as const;
export type AdditionShare = (typeof ADDITION_SHARES)[number];

export type Addition = {
  /** The liquidity to add. */
  liquidity: bigint;
  poolKey: PoolKey;
  range: Range;
  price: PoolPrice;
  /** What the addition takes of each currency at that price, before any tolerance. */
  need0: bigint;
  need1: bigint;
  /** What the wallet holds of each currency. For a native pool, `balance0` is its ETH. */
  balance0: bigint;
  balance1: bigint;
  /** The Permit2 the market pulls the ERC-20 tokens through. */
  permit2: Address;
};

/**
 * What adding to `tokenId` costs at the pool's price, all read at one block:
 * the pool's `slot0` from the `StateView` the valuer itself reads, the
 * position's range and liquidity from PositionManager, and the wallet's
 * balances. `amount` is a share of the position's liquidity, in percent, or
 * an amount of liquidity to price again.
 */
export async function readAddition(
  client: ReadClient,
  market: Address,
  tokenId: bigint,
  account: Address,
  amount: { share: number } | { liquidity: bigint },
): Promise<Addition> {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const at = { blockNumber } as const;

  const [positionManager, valuer] = await Promise.all([
    client.readContract({ address: market, abi: marketAbi, functionName: "positionManager", ...at }),
    client.readContract({ address: market, abi: marketAbi, functionName: "valuer", ...at }),
  ]);
  const positions = { address: positionManager, abi: positionsAbi, ...at } as const;
  const [[key, info], held, permit2, stateView] = await Promise.all([
    client.readContract({ ...positions, functionName: "getPoolAndPositionInfo", args: [tokenId] }),
    client.readContract({ ...positions, functionName: "getPositionLiquidity", args: [tokenId] }),
    client.readContract({ ...positions, functionName: "permit2" }),
    client.readContract({ address: valuer, abi: positionValuerAbi, functionName: "stateView", ...at }),
  ]);
  const poolKey: PoolKey = { ...key };
  const balanceOf = (currency: Address) =>
    isNative(currency)
      ? client.getBalance({ address: account, ...at })
      : client.readContract({ address: currency, abi: erc20Abi, functionName: "balanceOf", args: [account], ...at });
  const [[sqrtPriceX96, tick], balance0, balance1] = await Promise.all([
    client.readContract({ address: stateView, abi: stateViewAbi, functionName: "getSlot0", args: [poolIdOf(poolKey)], ...at }),
    balanceOf(poolKey.currency0),
    balanceOf(poolKey.currency1),
  ]);

  const liquidity = "share" in amount ? (held * BigInt(amount.share)) / 100n : amount.liquidity;
  const range = ticksOf(info);
  const price = { sqrtPriceX96, tick };
  return { liquidity, poolKey, range, price, ...amountsToAdd(price, range, liquidity), balance0, balance1, permit2 };
}

/* ------------------------------------------------------------------ */
/* The Permit2 permit                                                   */
/* ------------------------------------------------------------------ */

/**
 * Permit2's `PermitBatchTransferFrom`: a signature that lets one spender, the
 * market, move the listed amounts once, before the deadline. The domain has
 * `name`, `chainId` and `verifyingContract`, and no `version`.
 */
export const PERMIT2_DOMAIN_NAME = "Permit2";

export const PERMIT2_TYPES = {
  PermitBatchTransferFrom: [
    { name: "permitted", type: "TokenPermissions[]" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;

/**
 * How long the permit and the addition stay valid, on the chain's clock: the
 * permit's deadline is also the deadline PositionManager holds the addition to.
 */
export const ADDITION_VALIDITY_SECONDS = 10n * 60n;

/**
 * The ERC-20 legs of an addition, in pool order, each at its maximum: exactly
 * what the market requires the permit to list. Native ETH is no leg: it is
 * sent as the transaction's value.
 */
export function permittedFor(poolKey: PoolKey, max0: bigint, max1: bigint) {
  return [
    { token: poolKey.currency0, amount: max0 },
    { token: poolKey.currency1, amount: max1 },
  ].filter(({ token }) => !isNative(token));
}

export type AdditionPermit = {
  permit: { permitted: { token: Address; amount: bigint }[]; nonce: bigint; deadline: bigint };
  signature: Hex;
};

function randomNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
}

/** A nonce the wallet has not spent in Permit2: unordered, as PositionManager's are. */
async function unusedNonce({ publicClient }: Clients, permit2: Address, owner: Address) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const nonce = randomNonce();
    const bitmap = await publicClient.readContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "nonceBitmap",
      args: [owner, nonce >> 8n],
    });
    if ((bitmap & (1n << (nonce & 0xffn))) === 0n) return nonce;
  }
  throw new ActionError({ code: "NonceAlreadyUsed", message: "Could not find an unused permit nonce. Try again." });
}

/** Signs the permit for `permitted`, with the market as the only spender. */
export async function signAdditionPermit(
  clients: Clients,
  market: Address,
  permit2: Address,
  permitted: { token: Address; amount: bigint }[],
): Promise<AdditionPermit> {
  const { publicClient, walletClient } = clients;
  const [nonce, block] = await Promise.all([
    unusedNonce(clients, permit2, walletClient.account.address),
    publicClient.getBlock(),
  ]);
  const deadline = block.timestamp + ADDITION_VALIDITY_SECONDS;

  const signature = await walletClient.signTypedData({
    account: walletClient.account,
    domain: { name: PERMIT2_DOMAIN_NAME, chainId: chain.id, verifyingContract: permit2 },
    types: PERMIT2_TYPES,
    primaryType: "PermitBatchTransferFrom",
    message: { permitted, spender: market, nonce, deadline },
  });
  return { permit: { permitted, nonce, deadline }, signature };
}
