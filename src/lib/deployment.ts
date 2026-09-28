import { getAddress, isAddress, zeroAddress, type Address } from "viem";

import { chain } from "./chain";
import type { MarketTier } from "./risk-params";

/**
 * Where the Farmenta contracts are, read from the address manifest that
 * `script/manifest.sh` writes in the smart-contract repo (spec §13, one
 * manifest). The file is copied to `deployments/<name>.json` unchanged and
 * chosen with `NEXT_PUBLIC_FARMENTA_DEPLOYMENT`; `next.config.ts` hands its
 * contents to the bundle.
 *
 * Only the market (with the block it was deployed in), its lens and the
 * policy are taken from the file. What a
 * contract reports itself (`asset()`, `policy()`, `positionManager()`) is read
 * from the contract, so a market cannot be paired with the wrong token by a
 * slip in a file.
 */
export type MarketContracts = {
  market: Address;
  /** The block the market was deployed in: where its logs start. */
  startBlock: bigint;
  lens: Address;
};

export type Deployment = {
  chainId: number;
  collateralPolicy: Address;
  markets: Record<MarketTier, MarketContracts>;
};

/** The manifest names markets in camelCase; the app names tiers the way the URL does. */
const MANIFEST_NAME: Record<MarketTier, string> = { "blue-chip": "blueChip", meme: "meme" };

function contractAddress(value: unknown, path: string): Address {
  const address = (value as { address?: unknown } | null | undefined)?.address;
  if (typeof address !== "string" || !isAddress(address) || address === zeroAddress) {
    throw new Error(`deployment: ${path}.address is not a deployed contract address: ${String(address)}`);
  }
  return getAddress(address);
}

function startBlockOf(value: unknown, path: string): bigint {
  const startBlock = (value as { startBlock?: unknown } | null | undefined)?.startBlock;
  if (typeof startBlock !== "number" || !Number.isSafeInteger(startBlock) || startBlock < 0) {
    throw new Error(`deployment: ${path}.startBlock must be the block the contract was deployed in`);
  }
  return BigInt(startBlock);
}

/** Reads a manifest. Throws on anything that is not one, rather than leaving a hole to call into. */
export function parseDeployment(raw: unknown): Deployment {
  if (typeof raw !== "object" || raw === null) throw new Error("deployment: the manifest is not an object");
  const manifest = raw as Record<string, unknown>;

  if (manifest.chainId !== chain.id) {
    throw new Error(`deployment: the manifest is for chain ${String(manifest.chainId)}, the app runs on ${chain.id}`);
  }

  const markets = (manifest.markets ?? {}) as Record<string, unknown>;
  const lenses = (manifest.lenses ?? {}) as Record<string, unknown>;
  const pair = (tier: MarketTier): MarketContracts => ({
    market: contractAddress(markets[MANIFEST_NAME[tier]], `markets.${MANIFEST_NAME[tier]}`),
    startBlock: startBlockOf(markets[MANIFEST_NAME[tier]], `markets.${MANIFEST_NAME[tier]}`),
    lens: contractAddress(lenses[MANIFEST_NAME[tier]], `lenses.${MANIFEST_NAME[tier]}`),
  });

  return {
    chainId: chain.id,
    collateralPolicy: contractAddress(manifest.collateralPolicy, "collateralPolicy"),
    markets: { "blue-chip": pair("blue-chip"), meme: pair("meme") },
  };
}

/** The manifest JSON `next.config.ts` inlined, or nothing when no deployment is configured. */
const inlined = process.env.NEXT_PUBLIC_FARMENTA_MANIFEST;

/**
 * The configured deployment, or `null` when there is none. `null` is a state
 * the app runs in: pages open, and actions are disabled with a reason.
 */
export const deployment: Deployment | null = inlined ? parseDeployment(JSON.parse(inlined)) : null;

export const NOT_DEPLOYED = "The Farmenta contracts are not deployed yet.";
