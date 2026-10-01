import type { Address, Hex } from "viem";

import type { PoolKey } from "@/lib/onchain/contracts";
import type { MarketTier } from "@/lib/risk-params";

import * as fork from "../../../scripts/fork.mjs";

/**
 * What the fork is made of, typed for the tests. The values live in
 * `scripts/fork.mjs`, which starts the fork with them.
 */
type Pool = { key: PoolKey; id: Hex };
type Listed = Pool & { tier: MarketTier };

export const USDG = fork.USDG as Address;
export const ETH_USDG = fork.ETH_USDG as Listed;
export const META_USDG = fork.META_USDG as Listed;
export const NVDA_USDG = fork.NVDA_USDG as Listed;
export const CASHCAT_USDG = fork.CASHCAT_USDG as Listed;
export const PONS_USDG = fork.PONS_USDG as Listed;
export const AI_USDG = fork.AI_USDG as Listed;
export const LISTED_POOLS = fork.LISTED_POOLS as Listed[];
export const WETH_USDG_UNLISTED = fork.WETH_USDG_UNLISTED as Pool;
export const FORK_BLOCK = fork.FORK_BLOCK;
export const BEFORE_MEME_LISTINGS_BLOCK = fork.BEFORE_MEME_LISTINGS_BLOCK;
export const BEFORE_MEME_PRICES_BLOCK = fork.BEFORE_MEME_PRICES_BLOCK;
export const userKey = (label: string) => fork.forkKey(`user-${label}`);

/** Uniswap v4 PositionManager, docs ARCHITECTURE.md §18. */
export const POSITION_MANAGER: Address = "0x58daec3116aae6d93017baaea7749052e8a04fa7";

/** TwapRecorder, docs ARCHITECTURE.md §18.2. Anyone may record a pool's price in it. */
export const TWAP_RECORDER: Address = "0xEFC4B1A2BbF9B2D61d58e1E8543D9706f0f42484";

/**
 * Real positions at the fork's block, found in PoolManager's `ModifyLiquidity` logs and read
 * through `PositionValuer` on the fork, once the start has recorded the meme pools' prices.
 * They are live third-party state and only mean what they say at FORK_BLOCK. Each is held by an ordinary wallet, and the tests move it to a wallet
 * of their own by impersonating the holder. The values are the valuer's, in dollars.
 */
export const POSITIONS = {
  /** ETH/USDG, in range: 0.24 ETH and 767 USDG, about $1,397. */
  ethUsdgInRange: 3_402_463n,
  /** ETH/USDG, above its range: 200 USDG and no ETH. */
  ethUsdgAboveRange: 3_370_167n,
  /** META/USDG, in range: 496 USDG and 1.26 META, about $1,407. USDG is currency0. */
  metaUsdgInRange: 3_150_520n,
  /** META/USDG, out of range on the other side: 1.83 META and no USDG, about $1,330. */
  metaUsdgAllMeta: 3_428_194n,
  /** NVDA/USDG, in range: 862 USDG and 4.31 NVDA, about $1,856. USDG is currency0. */
  nvdaUsdgInRange: 3_387_125n,
  /** CASHCAT/USDG, in range, about $1,662. */
  cashcatUsdgInRange: 3_409_094n,
  /** PONS/USDG, in range, about $2,026. The pool has a hook and a dynamic fee. */
  ponsUsdgInRange: 3_449_705n,
  /** AI/USDG, in range, about $1,617. */
  aiUsdgInRange: 3_397_093n,
  /** WETH/USDG at fee 200, a pool Farmenta does not list. */
  unlistedPool: 999_597n,
} as const;
