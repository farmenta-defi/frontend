import { erc20Abi, maxUint256, type Abi, type Address, type Hex, type TransactionReceipt } from "viem";

import { chain } from "@/lib/chain";

import { marketAbi } from "./contracts";
import { ActionError, toActionError } from "./errors";
import { signCollateralPermit } from "./permit";
import { readCurrentDebt, type Clients } from "./reads";

/**
 * The six transactions a user sends (FAR-72): supply and withdraw USDG,
 * deposit collateral, borrow, repay, withdraw collateral.
 *
 * Every one is simulated first. A simulation that reverts sends nothing and
 * throws an `ActionError` carrying the contract's error name and a sentence.
 * Every read and write is pinned to chain 4663: a wallet on another network
 * is refused by viem before the request reaches it.
 *
 * Approvals are for the amount being moved, never unlimited.
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

async function send({ publicClient, walletClient }: Clients, name: Step["name"], call: Call, onStep?: Progress) {
  try {
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

const assetOf = ({ publicClient }: Clients, market: Address) =>
  publicClient.readContract({ address: market, abi: marketAbi, functionName: "asset" });

/** Lender: approve USDG, then `deposit(assets, receiver)`. The shares go to the sender. */
export async function supply(clients: Clients, market: Address, assets: bigint, onStep?: Progress) {
  const account = clients.walletClient.account.address;
  try {
    await approve(clients, await assetOf(clients, market), market, assets, onStep);
  } catch (error) {
    throw toActionError(error);
  }
  return send(clients, "supply", { address: market, abi: marketAbi, functionName: "deposit", args: [assets, account] }, onStep);
}

/** Lender: `withdraw(assets, receiver, owner)`, both the sender. The contract caps it at `maxWithdraw`. */
export function withdraw(clients: Clients, market: Address, assets: bigint, onStep?: Progress) {
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
export async function depositCollateral(clients: Clients, market: Address, tokenId: bigint, onStep?: Progress) {
  let permit;
  try {
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
export function borrow(clients: Clients, market: Address, tokenId: bigint, amount: bigint, onStep?: Progress) {
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
export async function repay(clients: Clients, market: Address, tokenId: bigint, amount: bigint | "max", onStep?: Progress) {
  try {
    const debt = await readCurrentDebt(clients.publicClient, market, tokenId);
    const all = amount === "max" || amount >= debt;
    await approve(clients, await assetOf(clients, market), market, all ? repayAllowance(debt) : amount, onStep);
    return await send(
      clients,
      "repay",
      { address: market, abi: marketAbi, functionName: "repay", args: [tokenId, all ? maxUint256 : amount] },
      onStep,
    );
  } catch (error) {
    throw toActionError(error);
  }
}

/** Borrower: `withdrawCollateral(tokenId, to)`, back to the sender. Reverts while anything is owed. */
export function withdrawCollateral(clients: Clients, market: Address, tokenId: bigint, onStep?: Progress) {
  const account = clients.walletClient.account.address;
  return send(
    clients,
    "withdrawCollateral",
    { address: market, abi: marketAbi, functionName: "withdrawCollateral", args: [tokenId, account] },
    onStep,
  );
}

export type { TransactionReceipt };
