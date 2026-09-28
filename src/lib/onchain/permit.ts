import type { Address, Hex } from "viem";

import { chain } from "@/lib/chain";

import { marketAbi, positionsAbi } from "./contracts";
import { ActionError } from "./errors";
import type { Clients } from "./reads";

/**
 * Uniswap v4 PositionManager's `Permit`, which lets a market take a position
 * NFT without a separate approval transaction (spec §12).
 *
 * It is not an ERC-721 standard: ERC-721 has none. The EIP-712 domain carries
 * `name`, `chainId` and `verifyingContract` and **no `version`**; a signer that
 * adds the usual fourth field produces a signature that always fails. Nonces
 * are unordered: any nonce the owner has not spent will do, so one is drawn at
 * random and checked against PositionManager's bitmap.
 */
export const PERMIT_DOMAIN_NAME = "Uniswap v4 Positions NFT";

export const PERMIT_TYPES = {
  Permit: [
    { name: "spender", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** How long a signature stays valid, counted from the chain's clock, not the browser's. */
export const PERMIT_VALIDITY_SECONDS = 30n * 60n;

export type CollateralPermit = { deadline: bigint; nonce: bigint; signature: Hex };

function randomNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
}

/** A nonce `owner` has not spent: the top 248 bits pick a word of the bitmap, the low 8 a bit in it. */
async function unusedNonce({ publicClient }: Clients, positionManager: Address, owner: Address) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const nonce = randomNonce();
    const bitmap = await publicClient.readContract({
      address: positionManager,
      abi: positionsAbi,
      functionName: "nonces",
      args: [owner, nonce >> 8n],
    });
    if ((bitmap & (1n << (nonce & 0xffn))) === 0n) return nonce;
  }
  throw new ActionError({ code: "NonceAlreadyUsed", message: "Could not find an unused permit nonce. Try again." });
}

export async function signCollateralPermit(clients: Clients, market: Address, tokenId: bigint): Promise<CollateralPermit> {
  const { publicClient, walletClient } = clients;
  const owner = walletClient.account.address;

  // The market names its PositionManager; the address is not written in this repo.
  const positionManager = await publicClient.readContract({
    address: market,
    abi: marketAbi,
    functionName: "positionManager",
  });
  const [nonce, block] = await Promise.all([unusedNonce(clients, positionManager, owner), publicClient.getBlock()]);
  const deadline = block.timestamp + PERMIT_VALIDITY_SECONDS;

  const signature = await walletClient.signTypedData({
    account: walletClient.account,
    domain: { name: PERMIT_DOMAIN_NAME, chainId: chain.id, verifyingContract: positionManager },
    types: PERMIT_TYPES,
    primaryType: "Permit",
    message: { spender: market, tokenId, nonce, deadline },
  });
  return { deadline, nonce, signature };
}
