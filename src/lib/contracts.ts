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
  /**
   * Chainlink ETH/USD proxy, from the Chainlink reference data directory
   * (feeds-robinhood-mainnet.json, fetched 2026-08-26). Never reconstruct
   * addresses from truncated forms — a previous value here matched the
   * truncation but had a wrong middle. Full list: docs ARCHITECTURE.md §18.
   */
  chainlinkEthUsd: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9" as Address,
  chainlinkUsdgUsd: "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2" as Address,
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
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
