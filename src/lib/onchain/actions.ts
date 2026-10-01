import { erc20Abi, maxUint256, type Abi, type Address, type Hex, type TransactionReceipt } from "viem";

import { chain } from "@/lib/chain";

import { marketAbi } from "./contracts";
import { permittedFor, readAddition, signAdditionPermit } from "./addition";
import { ActionError, explainAdditionError, explainRemovalError, toActionError } from "./errors";
import { depositCollateralGate, increaseLiquidityGate, repayGate, supplyGate, type Gate } from "./gates";
import { isNative } from "./range";
import { signCollateralPermit } from "./permit";
import { readLenderState, readPosition, type Clients, type MarketRefs } from "./reads";

/**
 * The nine transactions a user sends: supply and withdraw USDG, deposit
 * collateral, borrow, repay, withdraw collateral (FAR-72), collect a deposited
 * position's fees and remove part of its liquidity (FAR-73), and add liquidity
 * to it (FAR-66).
 *
 * Every one is simulated first. A simulation that reverts sends nothing and
 * throws an `ActionError` carrying the contract's error name and a sentence.
 * Every read and write is pinned to chain 4663: a wallet on another network
 * is refused by viem before the request reaches it.
 *
 * Approvals are for the amount being moved, never unlimited. An action that
 * starts with an approval or a signature runs its gate first, on state read
 * for it: the call behind it cannot be simulated until the approval is mined
 * or the permit signed, and neither should be asked for a call that will be
 * refused.
 */
export type Step = {
  /** Which transaction of the action this is. */
  name:
    | "approve"
    | "supply"
    | "withdraw"
    | "permit"
    | "depositCollateral"
    | "borrow"
    | "repay"
    | "withdrawCollateral"
    | "collectFees"
    | "decreaseLiquidity"
    | "approveAddition"
    | "permitAddition"
    | "increaseLiquidity";
  /** `sign`: waiting on the wallet. `confirm`: sent, waiting for the receipt. */
  phase: "sign" | "confirm";
  hash?: Hex;
};

export type Progress = (step: Step) => void;

/**
 * What an accrual can add to a call, in gas, with room to spare.
 *
 * Every action but the collateral deposit starts by accruing interest. When
 * the estimate is taken in the second of the market's last accrual, no time
 * has passed and the accrual returns at once; the transaction runs in a later
 * second, where it writes the index, the total and the reserves.
 *
 * Measured on the fork at contracts `49710c0`, as the smallest gas limit a
 * call is mined with, over its estimate (`test/fork/gas.test.ts` holds it):
 *
 *   after an earlier accrual    21,296 (`borrow`) to 41,061 (`withdrawCollateral`)
 *   the market's first accrual  38,975 (`borrow`) to 58,429 (`withdrawCollateral`)
 *
 * The first accrual writes the reserves from zero, which costs more. What a
 * call needs is above what it ends up using: `withdrawCollateral` clears
 * storage and is refunded for it, after having had to pay.
 *
 * It is a fixed amount, so it is added as one. A percentage of the estimate
 * covers it on an expensive call and not on a cheap one: with 25%, `deposit`
 * (estimate 95,646) and `withdraw` (97,618) were mined and ran out of gas.
 */
export const ACCRUAL_GAS = 100_000n;

/**
 * The gas limit a transaction is sent with: the estimate, a tenth more for
 * what else moves between the estimate and the block, and the accrual. Gas
 * that is not used is not charged.
 */
export const gasLimitFor = (estimate: bigint) => estimate + estimate / 10n + ACCRUAL_GAS;

type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint };

async function send(clients: Clients, name: Step["name"], call: Call, onStep?: Progress) {
  const { publicClient, walletClient } = clients;
  try {
    await requireChain(clients);
    const { request } = await publicClient.simulateContract({ ...call, account: walletClient.account, chain });
    const estimate = await publicClient.estimateContractGas({ ...call, account: walletClient.account });

    onStep?.({ name, phase: "sign" });
    const hash = await walletClient.writeContract({
      ...request,
      account: walletClient.account,
      chain,
      gas: gasLimitFor(estimate),
    });

    onStep?.({ name, phase: "confirm", hash });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new ActionError({ code: "Reverted", message: "The transaction was mined and reverted. Nothing changed." });
    }
    return receipt;
  } catch (error) {
    throw toActionError(error);
  }
}

function pass(gate: Gate) {
  if (!gate.ok) throw new ActionError(gate);
}

/**
 * Refuses a wallet that is not on chain 4663, before anything is signed or
 * sent. viem makes the same check when it sends through an injected wallet;
 * asking here covers every kind of account, and the permit too, which is a
 * signature and would otherwise be requested from a wallet on the wrong
 * network.
 */
async function requireChain({ walletClient }: Clients) {
  let walletChainId: number;
  try {
    walletChainId = await walletClient.getChainId();
  } catch (error) {
    throw toActionError(error);
  }
  if (walletChainId !== chain.id) {
    throw new ActionError({
      code: "WrongNetwork",
      message: `Your wallet is on another network. Switch to ${chain.name} and try again.`,
    });
  }
}

/**
 * Approves `spender` for `amount` of `token` unless the wallet already has.
 * The approval is for this amount, not for `type(uint256).max`.
 */
async function approve(
  clients: Clients,
  token: Address,
  spender: Address,
  amount: bigint,
  onStep?: Progress,
  name: Step["name"] = "approve",
) {
  const owner = clients.walletClient.account.address;
  const allowance = await clients.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return;
  await send(clients, name, { address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] }, onStep);
}

/** Lender: approve USDG, then `deposit(assets, receiver)`. The shares go to the sender. */
export async function supply(clients: Clients, { market }: MarketRefs, assets: bigint, onStep?: Progress) {
  const account = clients.walletClient.account.address;
  try {
    await requireChain(clients);
    const state = await readLenderState(clients.publicClient, market, account);
    pass(supplyGate(state, assets));
    await approve(clients, state.asset, market, assets, onStep);
  } catch (error) {
    throw toActionError(error);
  }
  return send(clients, "supply", { address: market, abi: marketAbi, functionName: "deposit", args: [assets, account] }, onStep);
}

/** Lender: `withdraw(assets, receiver, owner)`, both the sender. The contract caps it at `maxWithdraw`. */
export function withdraw(clients: Clients, { market }: MarketRefs, assets: bigint, onStep?: Progress) {
  const account = clients.walletClient.account.address;
  return send(
    clients,
    "withdraw",
    { address: market, abi: marketAbi, functionName: "withdraw", args: [assets, account, account] },
    onStep,
  );
}

/**
 * Borrower: signs PositionManager's EIP-712 `Permit` naming the market as
 * spender, then `depositCollateralWithPermit`. One transaction; no separate
 * approval is sent.
 */
export async function depositCollateral(clients: Clients, refs: MarketRefs, tokenId: bigint, onStep?: Progress) {
  const { market } = refs;
  let permit;
  try {
    await requireChain(clients);
    const position = await readPosition(clients.publicClient, refs, tokenId, clients.walletClient.account.address);
    pass(depositCollateralGate(position));
    onStep?.({ name: "permit", phase: "sign" });
    permit = await signCollateralPermit(clients, market, tokenId);
  } catch (error) {
    throw toActionError(error);
  }
  return send(
    clients,
    "depositCollateral",
    {
      address: market,
      abi: marketAbi,
      functionName: "depositCollateralWithPermit",
      args: [tokenId, permit.deadline, permit.nonce, permit.signature],
    },
    onStep,
  );
}

/** Borrower: `borrow(tokenId, amount, to)`, paid to the sender. */
export function borrow(clients: Clients, { market }: MarketRefs, tokenId: bigint, amount: bigint, onStep?: Progress) {
  const account = clients.walletClient.account.address;
  return send(
    clients,
    "borrow",
    { address: market, abi: marketAbi, functionName: "borrow", args: [tokenId, amount, account] },
    onStep,
  );
}

/**
 * What to approve for a full repayment: the debt as of now, plus a tenth of a
 * percent for the interest that runs until the transaction is mined. At the
 * steepest rate in spec §6.2 that covers several hours. The contract pulls the
 * debt and nothing more, so the cushion is never spent; it is what is left of
 * the allowance afterwards.
 */
export const repayAllowance = (debt: bigint) => debt + debt / 1000n + 1n;

/**
 * Borrower: approve USDG, then `repay(tokenId, amount)`. `"max"` repays the
 * whole debt with `repay(tokenId, type(uint256).max)`, so no dust is left by
 * interest accruing between the read and the transaction.
 */
export async function repay(clients: Clients, refs: MarketRefs, tokenId: bigint, amount: bigint | "max", onStep?: Progress) {
  const account = clients.walletClient.account.address;
  try {
    await requireChain(clients);
    const position = await readPosition(clients.publicClient, refs, tokenId, account);
    pass(repayGate(position, amount));
    const all = amount === "max" || amount >= position.debt;
    await approve(clients, position.asset, refs.market, all ? repayAllowance(position.debt) : amount, onStep);
    return await send(
      clients,
      "repay",
      { address: refs.market, abi: marketAbi, functionName: "repay", args: [tokenId, all ? maxUint256 : amount] },
      onStep,
    );
  } catch (error) {
    throw toActionError(error);
  }
}

/** Borrower: `withdrawCollateral(tokenId, to)`, back to the sender. Reverts while anything is owed. */
export function withdrawCollateral(clients: Clients, { market }: MarketRefs, tokenId: bigint, onStep?: Progress) {
  const account = clients.walletClient.account.address;
  return send(
    clients,
    "withdrawCollateral",
    { address: market, abi: marketAbi, functionName: "withdrawCollateral", args: [tokenId, account] },
    onStep,
  );
}

/**
 * Borrower: `collectFees(tokenId, to)`, paid to the sender. Both tokens of the
 * pool arrive, USDG first; in the ETH pool the other one is native ETH. The
 * position stays deposited. With a loan the market reverts a call that would
 * leave the health factor under 1.
 */
export function collectFees(clients: Clients, { market }: MarketRefs, tokenId: bigint, onStep?: Progress) {
  const account = clients.walletClient.account.address;
  return send(
    clients,
    "collectFees",
    { address: market, abi: marketAbi, functionName: "collectFees", args: [tokenId, account] },
    onStep,
  );
}

/**
 * Borrower: `decreaseLiquidity(tokenId, liquidity, min0, min1, to)`, paid to
 * the sender: the principal of that liquidity and every fee the position has
 * earned. `min0` and `min1` are the least principal accepted of each token,
 * from the quote the user was shown (`minimumsFor`); the simulation that runs
 * before the wallet is asked is the price read again, and a price that moved
 * past them sends nothing.
 */
export async function decreaseLiquidity(
  clients: Clients,
  { market }: MarketRefs,
  tokenId: bigint,
  removal: { liquidity: bigint; min0: bigint; min1: bigint },
  onStep?: Progress,
) {
  const account = clients.walletClient.account.address;
  try {
    return await send(
      clients,
      "decreaseLiquidity",
      {
        address: market,
        abi: marketAbi,
        functionName: "decreaseLiquidity",
        args: [tokenId, removal.liquidity, removal.min0, removal.min1, account],
      },
      onStep,
    );
  } catch (error) {
    // In the words of a removal, where the contract's error reads differently for one.
    const cause = error instanceof ActionError && error.cause ? error.cause : error;
    throw cause instanceof ActionError ? cause : new ActionError(explainRemovalError(cause), { cause });
  }
}

/**
 * Borrower: `increaseLiquidity(tokenId, liquidity, amount0Max, amount1Max, permit, signature)`.
 *
 * `max0` and `max1` are the most the wallet pays of each token: the need at
 * the pool's price plus the tolerance, as the user was shown (`additionFor`).
 * They are the only bound the contract holds an addition to, so they are
 * everywhere the same figure: the approval to Permit2, the permit, the call,
 * and for a native pool the ETH sent. Nothing is approved or permitted
 * without limit. The market gives back what the addition did not take, and
 * pays the position's fees out with it.
 *
 * Before anything is approved or signed the price is read again. A need that
 * has grown past a maximum is refused there: the approval would be wasted and
 * the permit signed for a transaction PositionManager reverts.
 */
export async function increaseLiquidity(
  clients: Clients,
  refs: MarketRefs,
  tokenId: bigint,
  addition: { liquidity: bigint; max0: bigint; max1: bigint },
  onStep?: Progress,
) {
  const { market } = refs;
  const account = clients.walletClient.account.address;
  const { liquidity, max0, max1 } = addition;
  try {
    await requireChain(clients);
    pass(increaseLiquidityGate(await readPosition(clients.publicClient, refs, tokenId, account)));

    const now = await readAddition(clients.publicClient, market, tokenId, account, { liquidity });
    if (now.need0 > max0 || now.need1 > max1) {
      throw new ActionError({
        code: "MaximumAmountExceeded",
        message:
          "The pool's price moved, and the addition would now cost more than the maximum it was quoted with. Get a new quote and try again.",
      });
    }
    if (max0 > now.balance0 || max1 > now.balance1) {
      throw new ActionError({ code: "InsufficientBalance", message: "Your wallet holds less than this addition can take." });
    }

    const permitted = permittedFor(now.poolKey, max0, max1);
    // Permit2 moves a token only as far as the wallet has approved Permit2 for it.
    for (const { token, amount } of permitted) {
      if (amount > 0n) await approve(clients, token, now.permit2, amount, onStep, "approveAddition");
    }
    onStep?.({ name: "permitAddition", phase: "sign" });
    const { permit, signature } = await signAdditionPermit(clients, market, now.permit2, permitted);

    return await send(
      clients,
      "increaseLiquidity",
      {
        address: market,
        abi: marketAbi,
        functionName: "increaseLiquidity",
        args: [tokenId, liquidity, max0, max1, permit, signature],
        // A native pool's ETH is no ERC-20 leg: the market wants exactly its maximum as value.
        value: isNative(now.poolKey.currency0) ? max0 : 0n,
      },
      onStep,
    );
  } catch (error) {
    // In the words of an addition, where the contract's error reads differently for one.
    const cause = error instanceof ActionError && error.cause ? error.cause : error;
    throw cause instanceof ActionError ? cause : new ActionError(explainAdditionError(cause), { cause });
  }
}

export type { TransactionReceipt };
