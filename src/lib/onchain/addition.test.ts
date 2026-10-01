import { zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";

import { ADDITION_SHARES, PERMIT2_DOMAIN_NAME, PERMIT2_TYPES, permittedFor } from "./addition";

/**
 * The shape of the permit an addition is pulled with. That Permit2 and the
 * market accept it is held on the fork (test/fork/add-liquidity.test.ts).
 */
const USDG: Address = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const META: Address = "0x00000000000000000000000000000000000000aa";
const key = (currency0: Address, currency1: Address) => ({ currency0, currency1, fee: 3000, tickSpacing: 60, hooks: zeroAddress });

describe("the tokens an addition's permit lists", () => {
  describe("positive", () => {
    it("are the pool's two ERC-20 currencies, in pool order, each at its maximum", () => {
      expect(permittedFor(key(USDG, META), 5n, 7n)).toEqual([
        { token: USDG, amount: 5n },
        { token: META, amount: 7n },
      ]);
    });
  });

  describe("negative", () => {
    it("leave native ETH out: it is sent as the transaction's value, not pulled", () => {
      expect(permittedFor(key(zeroAddress, USDG), 5n, 7n)).toEqual([{ token: USDG, amount: 7n }]);
    });
  });

  describe("edge case", () => {
    it("still list a currency the addition takes none of, at zero: the market wants every ERC-20 leg named", () => {
      expect(permittedFor(key(USDG, META), 0n, 7n)).toEqual([
        { token: USDG, amount: 0n },
        { token: META, amount: 7n },
      ]);
    });

    it("are never more than the maximum: there is no unlimited amount in the permit", () => {
      const amounts = permittedFor(key(USDG, META), 5n, 7n).map(({ amount }) => amount);
      expect(amounts).toEqual([5n, 7n]);
    });
  });
});

describe("the permit and the choice of how much to add", () => {
  describe("positive", () => {
    it("is Permit2's batch transfer, with the amounts and the one spender signed over", () => {
      expect(PERMIT2_DOMAIN_NAME).toBe("Permit2");
      expect(PERMIT2_TYPES.PermitBatchTransferFrom.map(({ name }) => name)).toEqual(["permitted", "spender", "nonce", "deadline"]);
      expect(PERMIT2_TYPES.TokenPermissions.map(({ name }) => name)).toEqual(["token", "amount"]);
    });
  });

  describe("negative", () => {
    it("offers no share of zero", () => {
      expect(Math.min(...ADDITION_SHARES)).toBeGreaterThan(0);
    });
  });

  describe("edge case", () => {
    it("offers up to as much again as the position holds", () => {
      expect(ADDITION_SHARES).toEqual([25, 50, 100]);
    });
  });
});
