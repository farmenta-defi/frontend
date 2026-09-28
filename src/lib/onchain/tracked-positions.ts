import type { Address } from "viem";

/**
 * The position NFTs a wallet has pointed this browser at.
 *
 * PositionManager has no `ERC721Enumerable` and the market keeps no list of
 * loans, so the chain cannot be asked "which positions are mine". The backend
 * can (FAR-71, from the indexer), and until it is wired in, and whenever it is
 * down, the app needs another way to know which token ids to read. This is
 * that way: ids the user typed or deposited here, kept in the browser.
 *
 * It is a list of things to look up, not a record of ownership. Every id is
 * read from the chain before it is shown, and one that turns out to belong to
 * someone else is shown as such and cannot be acted on.
 */
export type PositionStorage = Pick<Storage, "getItem" | "setItem">;

const keyOf = (chainId: number, account: Address) => `farmenta:positions:${chainId}:${account.toLowerCase()}`;

/** uint256, as PositionManager numbers its tokens. */
const MAX_TOKEN_ID = 2n ** 256n - 1n;

/** A token id a user typed, or `null` when it is not one. */
export function parseTokenId(input: string): bigint | null {
  const text = input.trim().replace(/^#/, "");
  if (!/^\d{1,78}$/.test(text)) return null;
  const tokenId = BigInt(text);
  return tokenId > 0n && tokenId <= MAX_TOKEN_ID ? tokenId : null;
}

export function readTracked(storage: PositionStorage, chainId: number, account: Address): bigint[] {
  try {
    const stored: unknown = JSON.parse(storage.getItem(keyOf(chainId, account)) ?? "[]");
    if (!Array.isArray(stored)) return [];
    const ids = stored.map((entry) => (typeof entry === "string" ? parseTokenId(entry) : null));
    return [...new Set(ids.filter((id): id is bigint => id !== null))];
  } catch {
    // Storage that cannot be read, or holds something else: start from nothing.
    return [];
  }
}

function write(storage: PositionStorage, chainId: number, account: Address, ids: bigint[]) {
  try {
    storage.setItem(keyOf(chainId, account), JSON.stringify(ids.map(String)));
  } catch {
    // A full or disabled storage loses the list on reload; the ids can be typed again.
  }
  return ids;
}

export function track(storage: PositionStorage, chainId: number, account: Address, tokenId: bigint) {
  const ids = readTracked(storage, chainId, account);
  return ids.includes(tokenId) ? ids : write(storage, chainId, account, [...ids, tokenId]);
}

export function untrack(storage: PositionStorage, chainId: number, account: Address, tokenId: bigint) {
  const ids = readTracked(storage, chainId, account);
  return write(storage, chainId, account, ids.filter((id) => id !== tokenId));
}
