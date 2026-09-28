import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import { poolIdOf, samePool, type PoolKey } from "./contracts";

// Two pools from docs ARCHITECTURE.md §18, with the keys PoolManager's `Initialize` gave them.
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const ETH_USDG_PLAIN: PoolKey = { currency0: zeroAddress, currency1: USDG, fee: 460, tickSpacing: 9, hooks: zeroAddress };
const WETH_USDG_PLAIN: PoolKey = { currency0: WETH, currency1: USDG, fee: 200, tickSpacing: 4, hooks: zeroAddress };

describe("poolIdOf", () => {
  describe("positive", () => {
    it("gives the id PoolManager gave the pool", () => {
      expect(poolIdOf(ETH_USDG_PLAIN)).toBe("0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32");
      expect(poolIdOf(WETH_USDG_PLAIN)).toBe("0x84bd4e2d8be11aeb0afc1195b38f587b61e90068548f1063fdbe448fb8cad0b6");
    });
  });

  describe("negative", () => {
    it("gives another id when any field of the key differs", () => {
      const id = poolIdOf(ETH_USDG_PLAIN);
      expect(poolIdOf({ ...ETH_USDG_PLAIN, fee: 461 })).not.toBe(id);
      expect(poolIdOf({ ...ETH_USDG_PLAIN, tickSpacing: 10 })).not.toBe(id);
      expect(poolIdOf({ ...ETH_USDG_PLAIN, currency0: WETH })).not.toBe(id);
    });
  });

  describe("edge case", () => {
    it("encodes a negative tick spacing as int24 rather than throwing", () => {
      expect(poolIdOf({ ...ETH_USDG_PLAIN, tickSpacing: -9 })).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("compares ids whatever their case, as a URL may carry either", () => {
      const id = poolIdOf(ETH_USDG_PLAIN);
      expect(samePool(id, id.toUpperCase().replace("0X", "0x") as `0x${string}`)).toBe(true);
      expect(samePool(id, poolIdOf(WETH_USDG_PLAIN))).toBe(false);
    });
  });
});
