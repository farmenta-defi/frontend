import { robinhood } from "viem/chains";

/**
 * The chain, importable from anywhere.
 *
 * `lib/wagmi.ts` cannot be imported by a Server Component: it calls
 * RainbowKit's `getDefaultConfig()` at module scope, which is client-only.
 * Anything rendered on the server only ever needs the chain's name, id, and
 * explorer URL, so those live here instead.
 */
export const chain = robinhood;
