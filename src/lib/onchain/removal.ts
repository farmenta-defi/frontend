import { BaseError, ContractFunctionRevertedError, maxUint128, type Address } from "viem";

import { marketAbi } from "./contracts";
import { ActionError, explainRemovalError, type Explained } from "./errors";
import type { ReadClient } from "./reads";

/**
 * Removing part of a deposited position's liquidity (FAR-73): how much, what
 * the pool would pay for it, and the least the transaction accepts.
 *
 * The share is a percentage of the position's liquidity. The whole of it is
 * not offered: what stays has to be worth the pool's minimum position, and a
 * position leaves whole through a repayment and `withdrawCollateral`.
 */
export const REMOVAL_SHARES = [25, 50, 75] as const;
export type RemovalShare = (typeof REMOVAL_SHARES)[number];

/** `share` percent of `liquidity`, rounded down. */
export const liquidityFor = (liquidity: bigint, share: number) => (liquidity * BigInt(share)) / 100n;

/**
 * The slippage tolerance, per token (spec §12, the rule for adding liquidity,
 * taken for removing it too: decided by the product owner, 1 Oct 2026).
 * 0.5% unless the user changes it; above 1% the panel warns; above 5% is refused.
 */
export const DEFAULT_TOLERANCE_BPS = 50;
export const TOLERANCE_WARNING_ABOVE_BPS = 100;
export const TOLERANCE_REFUSED_ABOVE_BPS = 500;

/**
 * A tolerance typed as a percentage, in basis points: "0.5" is 50. `null`
 * when it is not a number of at most two decimals, which is as fine as a
 * basis point goes.
 */
export function parseTolerance(text: string): number | null {
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(text.trim())) return null;
  const [whole, decimals = ""] = text.trim().split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

/** What a removal of `liquidity` pays out of the position's principal, in each of the pool's tokens. */
export type RemovalQuote = {
  liquidity: bigint;
  principal0: bigint;
  principal1: bigint;
};

/**
 * The least principal the removal must pay in each token: the quote less the
 * tolerance, rounded down. The position's fees are paid out with it and are
 * no part of either: PositionManager holds a minimum against the principal
 * alone, so a minimum that counted them would be one the principal has to
 * make up.
 */
export function minimumsFor(quote: RemovalQuote, toleranceBps: number) {
  const keep = BigInt(10_000 - toleranceBps);
  return { min0: (quote.principal0 * keep) / 10_000n, min1: (quote.principal1 * keep) / 10_000n };
}

type RemovalCall = { client: ReadClient; market: Address; tokenId: bigint; account: Address; blockNumber: bigint };

const simulate = ({ client, market, tokenId, account, blockNumber }: RemovalCall, liquidity: bigint, min0: bigint, min1: bigint) =>
  client.simulateContract({
    address: market,
    abi: marketAbi,
    functionName: "decreaseLiquidity",
    args: [tokenId, liquidity, min0, min1, account],
    account,
    blockNumber,
  });

/**
 * What the removal would pay of one token, as the pool has it at this block.
 *
 * Asked of the chain and not computed here: the call is simulated with a
 * minimum nothing can meet, and PositionManager refuses it with
 * `MinimumAmountInsufficient(minimum, received)`, where `received` is the
 * principal, fees apart. That is the pool's own arithmetic at its own price,
 * with whatever its hook takes or gives on a removal. `PositionValuer.value`
 * splits a position at the oracle's price instead: measured on the fork, a
 * quarter of each blue-chip position differed from it by 0.8% to 1.4% in a
 * token, more than the tolerance, so a minimum taken from the valuer would
 * refuse a removal no price had moved against.
 *
 * Any other refusal is the reason the removal cannot be made at all, and is
 * thrown as it is.
 */
async function principalOf(call: RemovalCall, liquidity: bigint, token: 0 | 1): Promise<bigint> {
  try {
    await simulate(call, liquidity, token === 0 ? maxUint128 : 0n, token === 1 ? maxUint128 : 0n);
  } catch (error) {
    const revert = error instanceof BaseError ? error.walk((cause) => cause instanceof ContractFunctionRevertedError) : null;
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "MinimumAmountInsufficient") {
      return (revert.data.args as readonly bigint[])[1];
    }
    throw new ActionError(explainRemovalError(error), { cause: error });
  }
  // Only a position paying 2^128 - 1 of a token gets here.
  throw new ActionError({ code: "QuoteUnavailable", message: "The pool gave no quote for this removal." });
}

export type Removal = {
  quote: RemovalQuote;
  /**
   * Why the removal would be refused whatever its minimums: too little would
   * be left, the loan would not fit what is left, a price is missing. `null`
   * when it would go through.
   */
  refusal: Explained | null;
};

/**
 * The quote for removing `liquidity`, and whether the market would take the
 * removal, all at one block. Three simulations, nothing sent.
 */
export async function readRemoval(
  client: ReadClient,
  market: Address,
  tokenId: bigint,
  account: Address,
  liquidity: bigint,
): Promise<Removal> {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const call = { client, market, tokenId, account, blockNumber };

  const [principal0, principal1] = await Promise.all([principalOf(call, liquidity, 0), principalOf(call, liquidity, 1)]);
  const refusal = await simulate(call, liquidity, 0n, 0n).then(
    () => null,
    (error: unknown) => explainRemovalError(error),
  );
  return { quote: { liquidity, principal0, principal1 }, refusal };
}
