import type { Address, Hex } from "viem";

import type { PoolKey } from "@/lib/onchain/contracts";

import * as fork from "../../../scripts/fork.mjs";

/**
 * What the fork is made of, typed for the tests. The values live in
 * `scripts/fork.mjs`, which deploys with them.
 */
type Pool = { key: PoolKey; id: Hex };

export const USDG = fork.USDG as Address;
export const ETH_USDG = fork.ETH_USDG as Pool;
export const WETH_USDG = fork.WETH_USDG as Pool;
export const deployer = fork.deployer;
export const guardian = fork.guardian;
export const FORK_BLOCK = fork.FORK_BLOCK;
export const userKey = (label: string) => fork.forkKey(`user-${label}`);

/** Uniswap v4 PositionManager, docs ARCHITECTURE.md §18. */
export const POSITION_MANAGER: Address = "0x58daec3116aae6d93017baaea7749052e8a04fa7";

/**
 * Real positions at the fork's block, from smart-contract `test/base/Fixtures.sol`. They are
 * live third-party state and only mean what they say at that block;
 * `PositionFixturesForkTest` in smart-contract asserts their shape.
 */
export const POSITIONS = {
  /** ETH/USDG plain pool, in range, fees accrued on both sides. */
  ethUsdgInRange: 1_768_881n,
  /** ETH/USDG plain pool, above range: all USDG, fees freshly collected. */
  ethUsdgAboveRange: 1_621_020n,
  /** WETH/USDG, wide range, in range. */
  wethUsdgInRange: 999_597n,
  /** ETH/USDG dyn-fee pool, which the fork does not list. */
  unlistedPool: 913_889n,
} as const;
