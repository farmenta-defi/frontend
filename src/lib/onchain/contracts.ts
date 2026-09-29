import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

import { collateralPolicyAbi } from "@/abis/CollateralPolicy";
import { farmentaErrorsAbi } from "@/abis/FarmentaErrors";
import { farmentaMarketAbi } from "@/abis/FarmentaMarket";
import { marketLensAbi } from "@/abis/MarketLens";
import { positionManagerAbi } from "@/abis/PositionManager";
import { priceOracleAbi } from "@/abis/PriceOracle";

/**
 * The ABIs the app calls with, each carrying every custom error a call can
 * revert with. A market call runs library code by delegatecall and calls the
 * policy, the oracle and PositionManager, so the revert that comes back is
 * often not one the market's own ABI declares; without the full list viem
 * reports a bare selector instead of `StalePrice`.
 */
export const marketAbi = [...farmentaMarketAbi, ...farmentaErrorsAbi] as const;
export const lensAbi = [...marketLensAbi, ...farmentaErrorsAbi] as const;
export const policyAbi = [...collateralPolicyAbi, ...farmentaErrorsAbi] as const;
export const positionsAbi = [...positionManagerAbi, ...farmentaErrorsAbi] as const;
export const oracleAbi = [...priceOracleAbi, ...farmentaErrorsAbi] as const;

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** Uniswap v4's `PoolId`: keccak256 of the ABI-encoded `PoolKey`. */
export function poolIdOf(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}

export const samePool = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();
