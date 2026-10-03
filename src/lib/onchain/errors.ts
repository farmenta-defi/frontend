import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  UserRejectedRequestError,
  type Hex,
} from "viem";

import { farmentaErrorsAbi } from "@/abis/FarmentaErrors";
import { chain } from "@/lib/chain";
import { usdgToNumber, wadToNumber } from "@/lib/units";

/**
 * Why a transaction was not sent, or failed, in words a user can act on.
 *
 * `code` is the contract's error name (or one of the few names below for
 * failures that are not reverts), so a caller and a test can tell the cases
 * apart without matching on prose.
 */
export type Explained = { code: string; message: string };

export class ActionError extends Error {
  readonly code: string;

  constructor({ code, message }: Explained, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ActionError";
    this.code = code;
  }
}

const usdg = (amount: unknown) =>
  `${usdgToNumber(amount as bigint).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDG`;
const usd = (value: unknown) =>
  `$${wadToNumber(value as bigint).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const percent = (bps: unknown) => `${(Number(bps) / 100).toFixed(2)}%`;

type Args = readonly unknown[];

/**
 * One line per error a user can run into. The units in each line are the ones
 * the contract reverts with: `BorrowExceedsMaxLtv` carries USD (1e18), the
 * debt caps carry USDG (6 decimals).
 */
type Messages = Record<string, (args: Args) => string>;

const MESSAGES: Messages = {
  // market state
  EnforcedPause: () =>
    "The market is paused. Supplying, depositing collateral, borrowing, collecting fees, and adding and removing liquidity are stopped; repaying and withdrawing still work.",
  PoolFrozenForNewPositions: () =>
    "This pool is frozen: it takes no new collateral. Positions already deposited can still be repaid and withdrawn.",
  PoolNotOpenForBorrowing: () =>
    "This pool is frozen: it gives no new loans. You can still repay and withdraw your collateral.",
  PoolNotListed: () => "This pool is not listed on Farmenta, so its positions cannot be used as collateral.",
  WrongTier: () => "This pool belongs to the other market. Open the pool from the market list and try again.",
  TokenNotEnabled: () => "One of this pool's tokens is no longer accepted as collateral.",
  HookNotPermitted: () => "This pool's hook is not accepted as collateral.",

  // borrowing
  BorrowExceedsMaxLtv: ([requested, maximum]) =>
    `That would bring the loan to ${usd(requested)}, above the ${usd(maximum)} this position can borrow. Borrow less.`,
  ZeroBorrowAmount: () => "Enter an amount to borrow.",
  PoolDebtCapExceeded: ([, requested, cap]) =>
    `This pool can lend ${usdg(cap)} in total and that would bring it to ${usdg(requested)}. Borrow less, or try later.`,
  MarketDebtCapExceeded: ([requested, cap]) =>
    `The market can lend ${usdg(cap)} in total and that would bring it to ${usdg(requested)}. Borrow less, or try later.`,
  BorrowerNotAuthorized: () => "Only the wallet that deposited this position can borrow against it.",
  SafeERC20FailedOperation: () => "The USDG transfer failed. Check your balance and the amount you approved.",

  // prices
  UsdgPriceOutOfBounds: ([price]) =>
    `USDG is priced at ${usd(price)}, outside the $0.97 to $1.03 the market lends within. Try again when it is back.`,
  StalePrice: () => "The price feed has not been updated recently enough to lend against. Try again in a moment.",
  InvalidPrice: () => "The price feed returned no valid price. Try again in a moment.",
  SpotPriceDeviation: ([deviation, maximum]) =>
    `The pool's price is ${percent(deviation)} away from the oracle, more than the ${percent(maximum)} allowed. Try again when they agree.`,
  MemeTwapUnavailable: () =>
    "This pool's price has not been recorded for 30 minutes yet, and the market lends against its 30-minute average. The pool can be used once the recording has run that long.",
  MemeSpotUnavailable: () => "This pool has no price to lend against right now. Try again in a few minutes.",

  // collateral
  OutstandingDebt: () => "This position still has debt. Repay the loan in full, then withdraw the collateral.",
  PermitRejected: () => "The signature for this position was not accepted. Sign again and resubmit.",
  SignatureDeadlineExpired: () => "The signature expired before the transaction was mined. Sign again and resubmit.",
  NonceAlreadyUsed: () => "That signature was already used. Sign again and resubmit.",
  PositionBelowMinimum: ([principal, minimum]) =>
    `This position is worth ${usd(principal)} after the pool's haircut, below the ${usd(minimum)} minimum for collateral.`,
  PositionIsEmpty: () => "This position holds no liquidity, so it cannot be collateral.",
  PositionAlreadyHeld: () => "This position is already deposited.",
  NotTheDepositor: () => "Only the wallet that deposited this position can withdraw it or collect its fees.",
  InvalidRecipient: () => "That address cannot receive the position or its fees.",
  PositionWouldBeUnhealthy: () =>
    "The market counts these fees as collateral, and without them the loan's health factor would be below 1. Repay part of the loan, then collect the fees.",
  InvalidBorrowRecipient: () => "That address cannot receive the loan.",

  // removing liquidity
  RemovalExceedsBorrowLimit: ([, debt, limit]) =>
    `What would be left can carry a loan of ${usd(limit)}, and this one is ${usd(debt)}. Remove less, or repay until the loan fits.`,
  LiquidityExceedsPosition: () => "The position holds less liquidity than that. Reload the page and try again.",
  ZeroLiquidity: () => "Choose how much of the liquidity to remove.",
  MaximumAmountExceeded: () =>
    "The pool's price moved, and the addition would now cost more than the maximum it was quoted with. Get a new quote and try again.",
  NativeValueMismatch: () => "The ETH sent does not match the addition. Reload the page and try again.",
  PermitDoesNotMatchPool: () => "The permit does not list this pool's tokens. Reload the page and try again.",
  MinimumAmountInsufficient: () =>
    "The pool's price moved, and the removal would now pay less than the minimum it was quoted with. Get a new quote and try again.",

  // vault
  ERC4626ExceededMaxWithdraw: ([, assets, max]) =>
    `You can withdraw up to ${usdg(max)} right now, and asked for ${usdg(assets)}. The limit is your deposit or the market's idle cash, whichever is lower.`,
  ERC4626ExceededMaxDeposit: () => "The market cannot take a deposit of that size.",
  ERC20InsufficientBalance: () => "Your balance is lower than that amount.",
  ERC20InsufficientAllowance: () => "The approved amount is lower than the amount being moved. Approve again and resubmit.",
};

/**
 * The errors that read differently when they come from a removal of liquidity.
 * `PositionBelowMinimum` is about a position being deposited everywhere else;
 * here it is about what the removal would leave.
 */
const REMOVAL_MESSAGES: Messages = {
  PositionBelowMinimum: ([left, minimum]) =>
    `What would be left is worth ${usd(left)} after the pool's haircut, below the pool's ${usd(minimum)} minimum. Remove less. To take the whole position out, repay the loan and withdraw the collateral.`,
  NotTheDepositor: () => "Only the wallet that deposited this position can remove its liquidity.",
  InvalidRecipient: () => "That address cannot receive the liquidity.",
};

/**
 * The errors that read differently when they come from an addition of liquidity. The market pays
 * the position's fees out before the liquidity goes in, so an addition can leave a loan less
 * healthy than it found it, and the way out is to add more.
 */
const ADDITION_MESSAGES: Messages = {
  PositionWouldBeUnhealthy: () =>
    "The position's fees are paid out before the liquidity goes in, and this addition is too small to make up for them: the loan's health factor would be below 1. Add more, or repay part of the loan.",
  NotTheDepositor: () => "Only the wallet that deposited this position can add liquidity to it.",
  PoolFrozenForNewPositions: () =>
    "This pool is frozen: it takes no added liquidity. Fees can still be collected and liquidity removed.",
  PoolNotListed: () => "This pool is not listed on Farmenta, so no liquidity can be added to its positions.",
  EnforcedPause: () => "The market is paused, so adding liquidity is stopped. Repaying and withdrawing still work.",
};

function fromRevert(name: string, args: Args | undefined, overrides?: Messages): Explained {
  if (name === "Error" || name === "Panic") {
    const reason = String(args?.[0] ?? "");
    return { code: name, message: reason ? `The transaction would fail: ${reason}.` : "The transaction would fail." };
  }
  const message = overrides?.[name] ?? MESSAGES[name];
  return {
    code: name,
    message: message ? message(args ?? []) : `The transaction would fail (${name}).`,
  };
}

/**
 * The revert data of a call that failed inside a batch, where there is no
 * viem error to walk: what `aggregate3` hands back for a call it let fail.
 */
export function explainRevertData(data: Hex): Explained {
  try {
    const decoded = decodeErrorResult({ abi: farmentaErrorsAbi, data });
    return fromRevert(decoded.errorName, decoded.args as Args | undefined);
  } catch {
    return {
      code: "UnknownRevert",
      message: data === "0x" ? "The call would fail." : `The call would fail (${data.slice(0, 10)}).`,
    };
  }
}

/** What the wording of an error depends on, of the pool it came from. `CollateralPool` is one. */
export type PoolInWords = {
  base: { symbol: string };
  feedHours: "always" | "us-stock-market";
};

/**
 * The same error in the words of the pool it came from, where they differ.
 *
 * A stale price is a feed that stopped for every token but a stock: a stock's
 * feed follows the US stock market and is quiet every weekend, for longer than
 * the 25 hours the oracle accepts. Trying again in a moment does not help
 * there, and the pool opens again by itself when the market does.
 */
export function explainForPool(explained: Explained, pool: PoolInWords | null | undefined): Explained {
  if (!pool) return explained;
  if (explained.code === "StalePrice" && pool.feedHours === "us-stock-market") {
    return {
      code: explained.code,
      message: `${pool.base.symbol}'s price feed follows the US stock market, and its last price is more than 25 hours old: the stock market is closed, as it is every weekend. Borrowing, depositing, withdrawing collateral that still has a loan against it, and collecting the fees of a position with a loan open again when the stock market does. Repaying works at any time.`,
    };
  }
  return explained;
}

/** `explainError` for an addition of liquidity. */
export const explainAdditionError = (error: unknown) => explainError(error, ADDITION_MESSAGES);

/** `explainError` for a removal of liquidity: the same errors, in the words of a removal where they differ. */
export const explainRemovalError = (error: unknown) => explainError(error, REMOVAL_MESSAGES);

/** Turns anything a simulation, a signature request or a send can throw into an `Explained`. */
export function explainError(error: unknown, overrides?: Messages): Explained {
  if (error instanceof ActionError) return { code: error.code, message: error.message };
  if (!(error instanceof BaseError)) {
    return { code: "Unknown", message: error instanceof Error ? error.message : "Something went wrong." };
  }

  if (error.walk((cause) => cause instanceof UserRejectedRequestError)) {
    return { code: "UserRejected", message: "You rejected the request in your wallet. Nothing was sent." };
  }
  if (error.walk((cause) => cause instanceof ChainMismatchError)) {
    return { code: "WrongNetwork", message: `Your wallet is on another network. Switch to ${chain.name} and try again.` };
  }

  const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError) {
    if (revert.data) return fromRevert(revert.data.errorName, revert.data.args, overrides);
    // The call's ABI did not know the selector. Every Farmenta error is in this one.
    if (revert.raw && revert.raw !== "0x") {
      try {
        const decoded = decodeErrorResult({ abi: farmentaErrorsAbi, data: revert.raw as Hex });
        return fromRevert(decoded.errorName, decoded.args as Args | undefined, overrides);
      } catch {
        return { code: "UnknownRevert", message: `The transaction would fail (${revert.signature ?? revert.raw.slice(0, 10)}).` };
      }
    }
    return { code: "UnknownRevert", message: revert.reason ? `The transaction would fail: ${revert.reason}.` : "The transaction would fail." };
  }

  return { code: "Unknown", message: error.shortMessage || "Something went wrong." };
}

/** `explainError`, as something to throw. */
export const toActionError = (error: unknown) =>
  error instanceof ActionError ? error : new ActionError(explainError(error), { cause: error });
