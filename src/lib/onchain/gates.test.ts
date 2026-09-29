import { maxUint256, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  borrowGate,
  depositCollateralGate,
  repayGate,
  sessionGate,
  supplyGate,
  withdrawCollateralGate,
  withdrawGate,
} from "./gates";
import type { LenderState, PositionState } from "./reads";

/**
 * The gates over states written by hand, for the branches that are about the
 * shape of a state. What the chain really answers is covered on the fork
 * (test/fork), which runs the same gates over states read from it.
 */
const USDG = 1_000_000n;
const POOL = "0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32";
const OTHER_POOL = "0x84bd4e2d8be11aeb0afc1195b38f587b61e90068548f1063fdbe448fb8cad0b6";

const lender = (over: Partial<LenderState> = {}): LenderState => ({
  asset: zeroAddress,
  balance: 500n * USDG,
  allowance: 0n,
  deposited: 200n * USDG,
  maxWithdraw: 200n * USDG,
  cash: 1_000n * USDG,
  paused: false,
  ...over,
});

const collateral = (over: Partial<PositionState> = {}): PositionState => ({
  tokenId: 123n,
  place: "collateral",
  poolId: POOL,
  poolKey: null,
  ticks: null,
  decimals: null,
  holdings: null,
  holdingsError: null,
  pool: { status: "open", terms: { maxLtvBps: 6500, ltBps: 7500 } },
  paused: false,
  debt: 100n * USDG,
  risk: { positionValue: 400n * 10n ** 18n, maxBorrow: 160n * USDG, healthFactor: 3n * 10n ** 18n },
  riskError: null,
  asset: zeroAddress,
  balance: 500n * USDG,
  allowance: 0n,
  ...over,
});

const inWallet = (over: Partial<PositionState> = {}) =>
  collateral({ place: "wallet", debt: 0n, risk: null, ...over });

const code = (gate: ReturnType<typeof supplyGate>) => (gate.ok ? "open" : gate.code);

describe("lender gates", () => {
  describe("positive", () => {
    it("opens for an amount the wallet holds and for a withdrawal within the limit", () => {
      expect(supplyGate(lender(), 500n * USDG)).toEqual({ ok: true });
      expect(withdrawGate(lender(), 200n * USDG)).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("stops supplying while the market is paused, whatever the amount", () => {
      expect(code(supplyGate(lender({ paused: true }), 1n))).toBe("EnforcedPause");
      expect(code(supplyGate(lender({ paused: true }), null))).toBe("EnforcedPause");
    });

    it("refuses a withdrawal above the limit", () => {
      expect(code(withdrawGate(lender(), 200n * USDG + 1n))).toBe("ERC4626ExceededMaxWithdraw");
    });
  });

  describe("edge case", () => {
    it("keeps withdrawing open while the market is paused", () => {
      expect(withdrawGate(lender({ paused: true }), 200n * USDG)).toEqual({ ok: true });
    });

    it("says the rest is lent out when idle cash, not the deposit, is the limit", () => {
      const gate = withdrawGate(lender({ maxWithdraw: 50n * USDG }), 60n * USDG);
      expect(gate.ok === false && gate.message).toMatch(/up to 50 USDG.*your 200 USDG is lent out/);
    });
  });
});

describe("depositCollateralGate", () => {
  describe("positive", () => {
    it("opens for a position in the wallet, from this pool, which is open", () => {
      expect(depositCollateralGate(inWallet(), POOL)).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("refuses a position that is not the wallet's to deposit", () => {
      expect(code(depositCollateralGate(inWallet({ place: "elsewhere" }), POOL))).toBe("NotTheOwner");
      expect(code(depositCollateralGate(inWallet({ place: "missing", poolId: null }), POOL))).toBe("PositionNotFound");
      expect(code(depositCollateralGate(collateral(), POOL))).toBe("PositionAlreadyHeld");
    });

    it("refuses while paused, while frozen, and for a pool that is not listed", () => {
      expect(code(depositCollateralGate(inWallet({ paused: true }), POOL))).toBe("EnforcedPause");
      expect(code(depositCollateralGate(inWallet({ pool: { status: "frozen", terms: null } }), POOL))).toBe(
        "PoolFrozenForNewPositions",
      );
      expect(code(depositCollateralGate(inWallet({ pool: { status: "unlisted", terms: null } }), POOL))).toBe(
        "PoolNotListed",
      );
    });
  });

  describe("edge case", () => {
    it("refuses a position from another pool on this pool's page, and takes it where no page is given", () => {
      expect(code(depositCollateralGate(inWallet(), OTHER_POOL))).toBe("WrongPool");
      expect(depositCollateralGate(inWallet())).toEqual({ ok: true });
    });

    it("compares pool ids whatever their case", () => {
      expect(depositCollateralGate(inWallet(), POOL.toUpperCase().replace("0X", "0x") as `0x${string}`)).toEqual({ ok: true });
    });

    it("refuses a position the valuer cannot price, with the valuer's reason: the market would refuse it too", () => {
      const noAverage = { code: "MemeTwapUnavailable", message: "not recorded for 30 minutes yet" };
      const stale = { code: "StalePrice", message: "the stock market is closed" };

      expect(depositCollateralGate(inWallet({ holdingsError: noAverage }), POOL)).toEqual({ ok: false, ...noAverage });
      expect(depositCollateralGate(inWallet({ holdingsError: stale }), POOL)).toEqual({ ok: false, ...stale });
    });

    it("says that a pool is frozen or not listed before it says that the position cannot be priced", () => {
      const unpriced = { holdingsError: { code: "StalePrice", message: "stale" } };

      expect(code(depositCollateralGate(inWallet({ ...unpriced, pool: { status: "unlisted", terms: null } }), POOL))).toBe(
        "PoolNotListed",
      );
      expect(code(depositCollateralGate(inWallet({ ...unpriced, pool: { status: "frozen", terms: null } }), POOL))).toBe(
        "PoolFrozenForNewPositions",
      );
    });

    it("takes a position that was valued, whatever an earlier reading failed with", () => {
      const holdings = { amount0: 1n, amount1: 1n, principalUsd: 100n * 10n ** 18n, feesUsd: 0n };

      expect(depositCollateralGate(inWallet({ holdings, holdingsError: null }), POOL)).toEqual({ ok: true });
    });
  });
});

describe("borrowGate", () => {
  describe("positive", () => {
    it("opens up to maxBorrow, inclusive", () => {
      expect(borrowGate(collateral(), 160n * USDG)).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("refuses above maxBorrow", () => {
      expect(code(borrowGate(collateral(), 160n * USDG + 1n))).toBe("BorrowExceedsMaxLtv");
    });

    it("refuses while paused and while the pool is frozen", () => {
      expect(code(borrowGate(collateral({ paused: true }), 10n * USDG))).toBe("EnforcedPause");
      expect(code(borrowGate(collateral({ pool: { status: "frozen", terms: null } }), 10n * USDG))).toBe(
        "PoolNotOpenForBorrowing",
      );
    });

    it("refuses a position that is not the wallet's collateral", () => {
      expect(code(borrowGate(inWallet(), 10n * USDG))).toBe("NotTheDepositor");
    });

    it("refuses a position of a pool that is not listed, and says that the pool is not listed", () => {
      const unlisted = { pool: { status: "unlisted", terms: null } } as const;

      const gate = borrowGate(inWallet(unlisted), 10n * USDG);

      expect(code(gate)).toBe("PoolNotListed");
      expect(gate.ok === false && gate.message).toMatch(/not listed/);
      expect(code(borrowGate(collateral(unlisted), 10n * USDG))).toBe("PoolNotListed");
    });
  });

  describe("edge case", () => {
    it("holds a first loan to the 10 USDG minimum, on the total and not on the amount", () => {
      const fresh = collateral({ debt: 0n });
      expect(code(borrowGate(fresh, 10n * USDG - 1n))).toBe("BorrowBelowMinimum");
      expect(borrowGate(fresh, 10n * USDG)).toEqual({ ok: true });
      // 4 USDG more on a loan that already owes 100 is a loan of 104.
      expect(borrowGate(collateral(), 4n * USDG)).toEqual({ ok: true });
    });

    it("says of a token that does not exist that it is not collateral, not that its pool is not listed", () => {
      const missing = inWallet({ place: "missing", poolId: null, pool: { status: "unlisted", terms: null } });

      expect(code(borrowGate(missing, 10n * USDG))).toBe("NotTheDepositor");
    });

    it("gives the oracle's reason when the position cannot be priced", () => {
      const unpriced = collateral({ risk: null, riskError: { code: "StalePrice", message: "stale" } });
      expect(borrowGate(unpriced, 10n * USDG)).toEqual({ ok: false, code: "StalePrice", message: "stale" });
    });
  });
});

describe("repayGate and withdrawCollateralGate", () => {
  describe("positive", () => {
    it("opens a partial and a full repayment the wallet can pay for", () => {
      expect(repayGate(collateral(), 40n * USDG)).toEqual({ ok: true });
      expect(repayGate(collateral(), "max")).toEqual({ ok: true });
    });

    it("opens the withdrawal of collateral once nothing is owed", () => {
      expect(withdrawCollateralGate(collateral({ debt: 0n }))).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("keeps the collateral while anything is owed, down to one unit", () => {
      expect(code(withdrawCollateralGate(collateral({ debt: 1n })))).toBe("OutstandingDebt");
    });

    it("refuses a repayment the wallet cannot pay for", () => {
      expect(code(repayGate(collateral({ balance: 99n * USDG }), "max"))).toBe("InsufficientBalance");
      expect(code(repayGate(collateral({ balance: 30n * USDG }), 40n * USDG))).toBe("InsufficientBalance");
    });
  });

  describe("edge case", () => {
    it("stays open while the market is paused and the pool is frozen", () => {
      const stopped = collateral({ paused: true, pool: { status: "frozen", terms: null } });
      expect(repayGate(stopped, "max")).toEqual({ ok: true });
      expect(withdrawCollateralGate({ ...stopped, debt: 0n })).toEqual({ ok: true });
    });

    it("stays open without a price, which neither needs", () => {
      const unpriced = collateral({ risk: null, riskError: { code: "StalePrice", message: "stale" } });
      expect(repayGate(unpriced, "max")).toEqual({ ok: true });
      expect(withdrawCollateralGate({ ...unpriced, debt: 0n })).toEqual({ ok: true });
    });

    it("counts an amount above the debt as the debt, which is what the contract does", () => {
      expect(repayGate(collateral({ balance: 100n * USDG }), maxUint256)).toEqual({ ok: true });
    });

    it("has nothing to repay on a loan without debt", () => {
      expect(code(repayGate(collateral({ debt: 0n }), "max"))).toBe("NoDebt");
    });
  });
});

describe("sessionGate", () => {
  const session = { deployed: true, account: zeroAddress, walletChainId: 4663, chainId: 4663, chainName: "Robinhood Chain" } as const;

  describe("positive", () => {
    it("opens for a connected wallet on chain 4663 with a deployment configured", () => {
      expect(sessionGate(session)).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("refuses a wallet on any other network", () => {
      expect(code(sessionGate({ ...session, walletChainId: 1 }))).toBe("WrongNetwork");
      expect(code(sessionGate({ ...session, walletChainId: 42161 }))).toBe("WrongNetwork");
    });

    it("refuses without a wallet", () => {
      expect(code(sessionGate({ ...session, account: undefined, walletChainId: undefined }))).toBe("NotConnected");
    });
  });

  describe("edge case", () => {
    it("says the contracts are not deployed before it asks for a wallet", () => {
      expect(code(sessionGate({ ...session, deployed: false, account: undefined }))).toBe("NotDeployed");
    });

    it("refuses a connected wallet whose network is not known yet", () => {
      expect(code(sessionGate({ ...session, walletChainId: undefined }))).toBe("WrongNetwork");
    });
  });
});
