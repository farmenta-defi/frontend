import { erc20Abi, maxUint256, type Abi, type Address, type Hex, type TransactionReceipt } from "viem";

import { chain } from "@/lib/chain";

import { marketAbi } from "./contracts";
import { ActionError, toActionError } from "./errors";
import { repayGate, supplyGate, type Gate } from "./gates";
import { signCollateralPermit } from "./permit";
import { readLenderState, readPosition, type Clients, type MarketRefs } from "./reads";

/**
 * The six transactions a user sends (FAR-72): supply and withdraw USDG,
 * deposit collateral, borrow, repay, withdraw collateral.
 *
 * Every one is simulated first. A simulation that reverts sends nothing and
 * throws an `ActionError` carrying the contract's error name and a sentence.
 * Every read and write is pinned to chain 4663: a wallet on another network
 * is refused by viem before the request reaches it.
 *
 * Approvals are for the amount being moved, never unlimited. An action that
 * starts with an approval runs its gate first, on state read for it: the
 * action behind an approval cannot be simulated until the approval is mined,
 * and an approval for a deposit that will be refused is gas for nothing.
 */
export type Step = {
  /** Which transaction of the action this is. */
  name: "approve" | "supply" | "withdraw" | "permit" | "depositCollateral" | "borrow" | "repay" | "withdrawCollateral";
  /** `sign`: waiting on the wallet. `confirm`: sent, waiting for the receipt. */
  phase: "sign" | "confirm";
  hash?: Hex;
};

export type Progress = (step: Step) => void;

type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

async function send(clients: Clients, name: Step["name"], call: Call, onStep?: Progress) {
  const { publicClient, walletClient } = clients;
  try {
    await requireChain(clients);
    const { request } = await publicClient.simulateContract({ ...call, account: walletClient.account, chain });

    onStep?.({ name, phase: "sign" });
    const hash = await walletClient.writeContract({ ...request, account: walletClient.account, chain });

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
async function approve(clients: Clients, token: Address, spender: Address, amount: bigint, onStep?: Progress) {
  const owner = clients.walletClient.account.address;
  const allowance = await clients.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return;
  await send(clients, "approve", { address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] }, onStep);
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
export async function depositCollateral(clients: Clients, { market }: MarketRefs, tokenId: bigint, onStep?: Progress) {
  let permit;
  try {
    await requireChain(clients);
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

export type { TransactionReceipt };
