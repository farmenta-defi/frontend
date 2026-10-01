import type { Address, Hex } from "viem";

import { usdgToNumber } from "@/lib/units";

import { samePool } from "./contracts";
import type { Explained } from "./errors";
import type { LenderState, PositionState } from "./reads";

/**
 * Whether an action may be offered, decided from state read from the chain.
 *
 * A gate is what disables a button and says why, before anything is signed. It
 * is not the last word: every action is also simulated before it is sent, and
 * the contract decides. Where a gate and the contract refuse the same thing,
 * the gate uses the contract's error name as its code, so the two read alike.
 */
export type Gate = { ok: true } | ({ ok: false } & Explained);

const OPEN: Gate = { ok: true };
const refuse = (code: string, message: string): Gate => ({ ok: false, code, message });

const amountOf = (amount: bigint) =>
  `${usdgToNumber(amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDG`;

const NO_AMOUNT = refuse("NoAmount", "Enter an amount.");
const PAUSED = (stopped: string) =>
  refuse("EnforcedPause", `The market is paused, so ${stopped} is stopped. Repaying and withdrawing still work.`);

/** An amount a user typed: `null` when it did not parse, zero when it is nothing. */
type Amount = bigint | null;
const missing = (amount: Amount): amount is null | 0n => amount === null || amount <= 0n;

/**
 * The gate of an action that brings funds into a market (supplying, depositing collateral,
 * borrowing), under the app's own switch for a market it holds closed (`CLOSED_MARKETS` in
 * `lib/markets`). A closed market refuses before anything else is looked at. The gates of what
 * takes funds out are not passed through here.
 */
export function entryGate(closure: { label: string } | null, gate: Gate): Gate {
  return closure ? refuse("MarketClosed", closure.label) : gate;
}

export function supplyGate(state: LenderState, assets: Amount): Gate {
  if (state.paused) return PAUSED("supplying");
  if (missing(assets)) return NO_AMOUNT;
  if (assets > state.balance) {
    return refuse("InsufficientBalance", `Your wallet holds ${amountOf(state.balance)}.`);
  }
  return OPEN;
}

/** Open while the market is paused: a lender can always take idle cash back (spec §4.1). */
export function withdrawGate(state: LenderState, assets: Amount): Gate {
  if (missing(assets)) return NO_AMOUNT;
  if (assets > state.maxWithdraw) {
    const limit =
      state.maxWithdraw < state.deposited
        ? `You can withdraw up to ${amountOf(state.maxWithdraw)} right now: the rest of your ${amountOf(state.deposited)} is lent out.`
        : `You can withdraw up to ${amountOf(state.maxWithdraw)}, your whole deposit.`;
    return refuse("ERC4626ExceededMaxWithdraw", limit);
  }
  return OPEN;
}

/** `poolId` is the pool whose page the user is on; a position from another pool does not belong there. */
export function depositCollateralGate(position: PositionState, poolId?: Hex): Gate {
  if (position.place === "missing") return refuse("PositionNotFound", "This position does not exist any more.");
  if (position.place === "collateral") return refuse("PositionAlreadyHeld", "This position is already deposited.");
  if (position.place === "elsewhere") return refuse("NotTheOwner", "This position is not in your wallet.");
  if (poolId && position.poolId && !samePool(poolId, position.poolId)) {
    return refuse("WrongPool", "This position provides liquidity to another pool.");
  }
  if (position.paused) return PAUSED("depositing collateral");
  if (position.pool.status === "unlisted") {
    return refuse("PoolNotListed", "This pool is not listed on Farmenta, so its positions cannot be used as collateral.");
  }
  if (position.pool.status === "frozen") {
    return refuse(
      "PoolFrozenForNewPositions",
      "This pool is frozen: it takes no new collateral. Positions already deposited can still be repaid and withdrawn.",
    );
  }
  // The market values a position when it takes it, with the valuer these holdings were read
  // from. What cannot be valued is refused, and the permit is not asked for.
  if (!position.holdings && position.holdingsError) {
    return refuse(position.holdingsError.code, position.holdingsError.message);
  }
  return OPEN;
}

const notCollateral = (position: PositionState) =>
  position.place === "collateral"
    ? null
    : refuse("NotTheDepositor", "This position is not deposited as your collateral.");

export function borrowGate(position: PositionState, amount: Amount): Gate {
  // Before anything about the loan: a pool that is not listed lends to nobody.
  if (position.place !== "missing" && position.pool.status === "unlisted") {
    return refuse("PoolNotListed", "This pool is not listed on Farmenta, so nothing can be borrowed against its positions.");
  }
  const refused = notCollateral(position);
  if (refused) return refused;
  if (position.paused) return PAUSED("borrowing");
  if (position.pool.status !== "open") {
    return refuse(
      "PoolNotOpenForBorrowing",
      "This pool is frozen: it gives no new loans. You can still repay and withdraw your collateral.",
    );
  }
  if (!position.risk) {
    return refuse(position.riskError?.code ?? "PriceUnavailable", position.riskError?.message ?? "This position cannot be priced right now.");
  }
  if (missing(amount)) return NO_AMOUNT;
  if (amount > position.risk.maxBorrow) {
    return refuse("BorrowExceedsMaxLtv", `This position can borrow up to ${amountOf(position.risk.maxBorrow)} more.`);
  }
  return OPEN;
}

/** `"max"` repays the whole debt. Open while paused and while frozen (spec §4.1, §6.5). */
export function repayGate(position: PositionState, amount: Amount | "max"): Gate {
  const refused = notCollateral(position);
  if (refused) return refused;
  if (position.debt === 0n) return refuse("NoDebt", "This position has no debt.");
  if (amount !== "max" && missing(amount)) return NO_AMOUNT;

  const needed = amount === "max" || amount > position.debt ? position.debt : amount;
  if (needed > position.balance) {
    return refuse(
      "InsufficientBalance",
      `Repaying ${amountOf(needed)} needs more than the ${amountOf(position.balance)} in your wallet.`,
    );
  }
  return OPEN;
}

/** Offered only once nothing is owed. Open while paused and while frozen. */
export function withdrawCollateralGate(position: PositionState): Gate {
  const refused = notCollateral(position);
  if (refused) return refused;
  if (position.debt > 0n) {
    return refuse(
      "OutstandingDebt",
      `This position still owes ${amountOf(position.debt)}. Repay the loan in full, then withdraw the collateral.`,
    );
  }
  return OPEN;
}

/** What has to be true of the session before any action: a deployment, a wallet, the right network. */
export function sessionGate(session: {
  deployed: boolean;
  account: Address | undefined;
  walletChainId: number | undefined;
  chainId: number;
  chainName: string;
}): Gate {
  if (!session.deployed) return refuse("NotDeployed", "The Farmenta contracts are not deployed yet.");
  if (!session.account) return refuse("NotConnected", "Connect a wallet.");
  if (session.walletChainId !== session.chainId) {
    return refuse("WrongNetwork", `Your wallet is on another network. Switch to ${session.chainName}.`);
  }
  return OPEN;
}
