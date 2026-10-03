import { maxUint256, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  additionFundsGate,
  increaseLiquidityGate,
  toleranceGate,
  entryGate,
  borrowGate,
  collectFeesGate,
  decreaseLiquidityGate,
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

describe("entryGate, the app's switch for a market it holds closed", () => {
  const closure = { label: "Temporarily closed" };

  describe("positive", () => {
    it("leaves a gate as it is in a market that is not closed", () => {
      expect(entryGate(null, supplyGate(lender(), 100n * USDG))).toEqual({ ok: true });
      expect(code(entryGate(null, supplyGate(lender(), 501n * USDG)))).toBe("InsufficientBalance");
    });
  });

  describe("negative", () => {
    it("refuses what would otherwise go through, with the closure's label", () => {
      const gate = entryGate(closure, supplyGate(lender(), 100n * USDG));

      expect(gate).toEqual({ ok: false, code: "MarketClosed", message: closure.label });
      expect(code(entryGate(closure, borrowGate(collateral(), 4n * USDG)))).toBe("MarketClosed");
      expect(code(entryGate(closure, depositCollateralGate(inWallet(), POOL)))).toBe("MarketClosed");
    });
  });

  describe("edge case", () => {
    it("says the market is closed before any other reason, so nobody is told to fix something that would not help", () => {
      expect(code(entryGate(closure, supplyGate(lender(), null)))).toBe("MarketClosed");
      expect(code(entryGate(closure, supplyGate(lender(), 501n * USDG)))).toBe("MarketClosed");
    });

    it("is not what the ways out are decided by: withdrawing and repaying keep their own gates", () => {
      expect(withdrawGate(lender(), 100n * USDG)).toEqual({ ok: true });
      expect(repayGate(collateral(), 50n * USDG)).toEqual({ ok: true });
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
      const holdings = { liquidity: 1_000n, amount0: 1n, amount1: 1n, fees0: 0n, fees1: 0n, principalUsd: 100n * 10n ** 18n, feesUsd: 0n };

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
    it("has no minimum loan: the smallest unit of USDG is a loan, and nothing is not", () => {
      const fresh = collateral({ debt: 0n });
      expect(borrowGate(fresh, 1n)).toEqual({ ok: true });
      expect(borrowGate(fresh, 10n * USDG - 1n)).toEqual({ ok: true });
      expect(code(borrowGate(fresh, 0n))).toBe("NoAmount");
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

describe("collectFeesGate", () => {
  const WAD = 10n ** 18n;
  /** Fees in each of the pool's two tokens. The USD figure follows them, as the valuer's does. */
  const holdings = (fees0: bigint, fees1 = 0n) => ({
    liquidity: 1_000n, amount0: 1n,
    amount1: 1n,
    fees0,
    fees1,
    principalUsd: 400n * WAD,
    feesUsd: (fees0 + fees1) * WAD,
  });
  const earning = (over: Partial<PositionState> = {}) => collateral({ holdings: holdings(3n, 2n), ...over });

  describe("positive", () => {
    it("opens for collateral that has earned fees, with a loan and without", () => {
      expect(collectFeesGate(earning())).toEqual({ ok: true });
      expect(collectFeesGate(earning({ debt: 0n }))).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("refuses a position that is not the wallet's collateral", () => {
      expect(code(collectFeesGate(inWallet({ holdings: holdings(3n, 2n) })))).toBe("NotTheDepositor");
      expect(code(collectFeesGate(earning({ place: "elsewhere" })))).toBe("NotTheDepositor");
    });

    it("stops while the market is paused, with a loan and without", () => {
      expect(code(collectFeesGate(earning({ paused: true })))).toBe("EnforcedPause");
      const gate = collectFeesGate(earning({ paused: true, debt: 0n }));
      expect(gate.ok === false && gate.message).toMatch(/paused.*collecting fees/);
    });

    it("has nothing to collect where no fees have been earned in either token", () => {
      expect(code(collectFeesGate(earning({ holdings: holdings(0n, 0n) })))).toBe("NoFees");
    });

    it("refuses a loan that cannot be priced, with the oracle's reason", () => {
      const unpriced = earning({ risk: null, riskError: { code: "StalePrice", message: "stale" } });
      expect(collectFeesGate(unpriced)).toEqual({ ok: false, code: "StalePrice", message: "stale" });
      expect(code(collectFeesGate(earning({ risk: null })))).toBe("PriceUnavailable");
    });
  });

  describe("edge case", () => {
    it("stays open while the pool is frozen", () => {
      expect(collectFeesGate(earning({ pool: { status: "frozen", terms: null } }))).toEqual({ ok: true });
    });

    it("needs no price without a loan: the market checks nothing then", () => {
      const unpriced = earning({ debt: 0n, risk: null, riskError: { code: "StalePrice", message: "stale" } });
      expect(collectFeesGate(unpriced)).toEqual({ ok: true });
    });

    it("stays open without a loan where the fees could not be read, and leaves it to the contract", () => {
      expect(collectFeesGate(collateral({ debt: 0n, holdings: null, risk: null }))).toEqual({ ok: true });
    });

    it("opens for the smallest unit of a fee, in one token alone", () => {
      expect(collectFeesGate(earning({ holdings: holdings(1n, 0n) }))).toEqual({ ok: true });
      expect(collectFeesGate(earning({ holdings: holdings(0n, 1n) }))).toEqual({ ok: true });
    });

    it("goes by the tokens and not by their value: fees worth less than the valuer can price are still collected", () => {
      expect(collectFeesGate(earning({ holdings: { ...holdings(0n, 1n), feesUsd: 0n } }))).toEqual({ ok: true });
    });
  });
});

describe("decreaseLiquidityGate", () => {
  const priced = (over: Partial<PositionState> = {}) =>
    collateral({
      holdings: { liquidity: 1_000n, amount0: 1n, amount1: 1n, fees0: 0n, fees1: 0n, principalUsd: 400n * 10n ** 18n, feesUsd: 0n },
      ...over,
    });

  describe("positive", () => {
    it("opens for priced collateral at the default tolerance, with a loan and without", () => {
      expect(decreaseLiquidityGate(priced(), 50)).toEqual({ ok: true });
      expect(decreaseLiquidityGate(priced({ debt: 0n }), 50)).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("refuses a position that is not the wallet's collateral", () => {
      expect(code(decreaseLiquidityGate(inWallet(), 50))).toBe("NotTheDepositor");
    });

    it("stops while the market is paused", () => {
      const gate = decreaseLiquidityGate(priced({ paused: true }), 50);
      expect(code(gate)).toBe("EnforcedPause");
      expect(gate.ok === false && gate.message).toMatch(/paused.*removing liquidity/);
    });

    it("refuses a tolerance above 5%, and one that is not a number", () => {
      expect(code(decreaseLiquidityGate(priced(), 501))).toBe("ToleranceTooHigh");
      expect(code(decreaseLiquidityGate(priced(), null))).toBe("NoTolerance");
    });

    it("needs a price even without a loan: the market values what is left against the pool's minimum", () => {
      const stale = { code: "StalePrice", message: "stale" };
      const unpriced = priced({ debt: 0n, holdings: null, holdingsError: stale, risk: null });
      expect(decreaseLiquidityGate(unpriced, 50)).toEqual({ ok: false, ...stale });
      expect(code(decreaseLiquidityGate(priced({ risk: null, riskError: stale }), 50))).toBe("StalePrice");
    });
  });

  describe("edge case", () => {
    it("stays open while the pool is frozen", () => {
      expect(decreaseLiquidityGate(priced({ pool: { status: "frozen", terms: null } }), 50)).toEqual({ ok: true });
    });

    it("takes 5% exactly, 1%, and zero", () => {
      for (const bps of [500, 100, 0]) expect(decreaseLiquidityGate(priced(), bps), String(bps)).toEqual({ ok: true });
    });

    it("says the market is paused before it says anything about the tolerance", () => {
      expect(code(decreaseLiquidityGate(priced({ paused: true }), null))).toBe("EnforcedPause");
    });
  });
});

describe("increaseLiquidityGate", () => {
  describe("positive", () => {
    it("opens for collateral in an open pool, with a loan and without", () => {
      expect(increaseLiquidityGate(collateral())).toEqual({ ok: true });
      expect(increaseLiquidityGate(collateral({ debt: 0n }))).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("refuses a position that is not the wallet's collateral", () => {
      expect(code(increaseLiquidityGate(inWallet()))).toBe("NotTheDepositor");
    });

    it("stops while the market is paused, and in a pool that takes no new capital", () => {
      const paused = increaseLiquidityGate(collateral({ paused: true }));
      expect(code(paused)).toBe("EnforcedPause");
      expect(paused.ok === false && paused.message).toMatch(/paused.*adding liquidity/);

      const frozen = increaseLiquidityGate(collateral({ pool: { status: "frozen", terms: null } }));
      expect(code(frozen)).toBe("PoolFrozenForNewPositions");
      expect(frozen.ok === false && frozen.message).toMatch(/no added liquidity/);
      expect(code(increaseLiquidityGate(collateral({ pool: { status: "unlisted", terms: null } })))).toBe("PoolNotListed");
    });

    it("refuses a loan that cannot be priced, with the oracle's reason", () => {
      const stale = { code: "StalePrice", message: "stale" };
      expect(increaseLiquidityGate(collateral({ risk: null, riskError: stale }))).toEqual({ ok: false, ...stale });
    });
  });

  describe("edge case", () => {
    it("needs no price without a loan", () => {
      const unpriced = collateral({ debt: 0n, holdings: null, risk: null, riskError: { code: "StalePrice", message: "stale" } });
      expect(increaseLiquidityGate(unpriced)).toEqual({ ok: true });
    });

    it("is refused by a market the app holds closed, before any other reason", () => {
      const closure = { label: "Temporarily closed" };
      expect(code(entryGate(closure, increaseLiquidityGate(collateral())))).toBe("MarketClosed");
      expect(code(entryGate(closure, increaseLiquidityGate(collateral({ paused: true }))))).toBe("MarketClosed");
    });
  });
});

describe("toleranceGate", () => {
  describe("positive", () => {
    it("takes the default, and anything up to 5%", () => {
      for (const bps of [0, 50, 100, 500]) expect(toleranceGate(bps), String(bps)).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("refuses above 5%, and what is not a tolerance", () => {
      expect(code(toleranceGate(501))).toBe("ToleranceTooHigh");
      expect(code(toleranceGate(null))).toBe("NoTolerance");
    });
  });

  describe("edge case", () => {
    it("is the same rule a removal is held to", () => {
      const priced = collateral({
        holdings: { liquidity: 1n, amount0: 1n, amount1: 1n, fees0: 0n, fees1: 0n, principalUsd: 400n * 10n ** 18n, feesUsd: 0n },
      });
      for (const bps of [null, 0, 500, 501]) expect(decreaseLiquidityGate(priced, bps), String(bps)).toEqual(toleranceGate(bps));
    });
  });
});

describe("additionFundsGate", () => {
  const symbols = ["ETH", "USDG"] as const;
  const funds = { max0: 10n, max1: 20n, balance0: 10n, balance1: 20n };

  describe("positive", () => {
    it("opens for a wallet that holds each maximum, to the unit", () => {
      expect(additionFundsGate(funds, symbols)).toEqual({ ok: true });
    });
  });

  describe("negative", () => {
    it("names the token the wallet is short of, or both", () => {
      const eth = additionFundsGate({ ...funds, balance0: 9n }, symbols);
      const both = additionFundsGate({ ...funds, balance0: 9n, balance1: 0n }, symbols);

      expect(code(eth)).toBe("InsufficientBalance");
      expect(eth.ok === false && eth.message).toMatch(/less ETH than/);
      expect(both.ok === false && both.message).toMatch(/less ETH and less USDG than/);
    });
  });

  describe("edge case", () => {
    it("goes by the maximum, not the need: the market pulls the maximum and gives the change back", () => {
      // The need would be 19; the maximum is 20, and the wallet holds 19.
      expect(code(additionFundsGate({ ...funds, balance1: 19n }, symbols))).toBe("InsufficientBalance");
    });

    it("asks nothing of a token the addition takes none of", () => {
      expect(additionFundsGate({ max0: 0n, max1: 20n, balance0: 0n, balance1: 20n }, symbols)).toEqual({ ok: true });
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
