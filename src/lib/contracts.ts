import type { Address } from "viem";

/**
 * Verified contract addresses on Robinhood Chain mainnet (chain id 4663).
 * Sources: developers.uniswap.org deployments + on-chain verification (Aug 2026).
 * See farmenta-defi/docs → ARCHITECTURE.md §2.
 */
export const contracts = {
  // Uniswap v4 (official, Uniswap Labs)
  poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951" as Address,
  positionManager: "0x58daec3116aae6d93017baaea7749052e8a04fa7" as Address,
  stateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as Address,
  v4Quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" as Address,
  /** Primary router (11.3M txs, used by the Uniswap app). */
  universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904" as Address,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
  // Third-party
  morphoBlue: "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010" as Address,
  chainlinkEthUsd: "0x78F3556b2b78d8d9789b0d4d7c1c9dea9f83d3A9" as Address,
  // Farmenta (filled in once deployed)
  marketBlueChip: undefined as Address | undefined,
  marketMeme: undefined as Address | undefined,
} as const;

export const tokens = {
  usdg: {
    address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address,
    symbol: "USDG",
    decimals: 6,
  },
  weth: {
    address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address,
    symbol: "WETH",
    decimals: 18,
  },
} as const;

/** Minimal ABI fragments used by the UI. */
export const positionManagerAbi = [
  {
    type: "function",
    name: "nextTokenId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
