import { robinhood } from "viem/chains";

/**
 * The chain, importable from anywhere.
 *
 * `lib/wagmi.ts` cannot be imported by a Server Component: it calls
 * RainbowKit's `getDefaultConfig()` at module scope, which is client-only.
 * Server-rendered chrome (footer, hero) only ever needs the chain's name,
 * id, and explorer URL, so those live here instead.
 */
export const chain = robinhood;

/** Blockscout page for a Uniswap v4 position NFT held by an address. */
export const explorerNftUrl = (positionManager: string, tokenId: number | bigint) =>
  `${chain.blockExplorers.default.url}/token/${positionManager}/instance/${tokenId}`;
