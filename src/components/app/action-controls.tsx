"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { buttonClasses } from "@/components/ui/button";
import { parseAmount, sanitizeAmount } from "@/components/ui/field";
import { chain } from "@/lib/chain";
import { fmtUsdExact } from "@/lib/format";
import type { Step } from "@/lib/onchain/actions";
import { explainForPool, type PoolInWords } from "@/lib/onchain/errors";
import type { Gate } from "@/lib/onchain/gates";
import type { ActionState, Session } from "@/lib/onchain/hooks";
import { cn } from "@/lib/utils";

/**
 * The controls every on-chain action shares: the amount field, the button
 * that sends it, and the line under the button that says where it is.
 */

/** What a button that cannot be pressed says, by the reason it cannot. */
const BLOCKED: Record<string, string> = {
  NotDeployed: "Contracts not deployed",
  NoAmount: "Enter an amount",
  NoPosition: "No position to borrow against",
  PositionsUnavailable: "Positions not loaded",
  Loading: "Reading the chain…",
  InsufficientBalance: "Insufficient balance",
  ERC4626ExceededMaxWithdraw: "Over the withdrawable amount",
  BorrowExceedsMaxLtv: "Over the max LTV",
  EnforcedPause: "Market paused",
  PoolNotOpenForBorrowing: "Pool frozen",
  PoolFrozenForNewPositions: "Pool frozen",
  PoolNotListed: "Pool not listed",
  OutstandingDebt: "Repay the loan first",
  NoDebt: "Nothing to repay",
  StalePrice: "Price unavailable",
  InvalidPrice: "Price unavailable",
  MemeTwapUnavailable: "Price unavailable",
  MemeSpotUnavailable: "Price unavailable",
  PriceUnavailable: "Price unavailable",
};

const STEP: Record<Step["name"], Record<Step["phase"], string>> = {
  approve: { sign: "Approve the USDG in your wallet.", confirm: "Waiting for the approval to confirm." },
  permit: { sign: "Sign the permit for this position in your wallet.", confirm: "" },
  supply: { sign: "Confirm the supply in your wallet.", confirm: "Waiting for the supply to confirm." },
  withdraw: { sign: "Confirm the withdrawal in your wallet.", confirm: "Waiting for the withdrawal to confirm." },
  depositCollateral: { sign: "Confirm the deposit in your wallet.", confirm: "Waiting for the deposit to confirm." },
  borrow: { sign: "Confirm the loan in your wallet.", confirm: "Waiting for the loan to confirm." },
  repay: { sign: "Confirm the repayment in your wallet.", confirm: "Waiting for the repayment to confirm." },
  withdrawCollateral: {
    sign: "Confirm the withdrawal in your wallet.",
    confirm: "Waiting for the withdrawal to confirm.",
  },
};

/** Big figure, then the two footnotes under it: value left, the limit and MAX right. */
export function AmountField({
  id,
  label,
  value,
  onChange,
  limitLabel,
  onMax,
  disabled,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  limitLabel: string;
  onMax: () => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(event) => onChange(sanitizeAmount(event.target.value))}
        className={cn(
          "font-display tnum mt-2 w-full bg-transparent text-[30px] font-semibold leading-none outline-none placeholder:text-steel-600",
          invalid ? "text-danger" : "text-foreground",
          disabled && "opacity-45",
        )}
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="tnum text-[12px] text-steel-500">{fmtUsdExact(parseAmount(value))}</span>
        <span className="flex items-center gap-2">
          <span className="tnum text-[12px] text-steel-500">{limitLabel}</span>
          <button
            type="button"
            onClick={onMax}
            disabled={disabled}
            className="focus-ring rounded-md bg-white/[0.07] px-2 py-1 text-[11px] font-medium tracking-wide text-steel-300 transition-colors hover:bg-white/[0.12] hover:text-foreground disabled:opacity-40"
          >
            MAX
          </button>
        </span>
      </div>
    </>
  );
}

/**
 * The button that sends an action. Without a wallet it connects one, and on
 * another network it offers the switch; in both cases nothing can be sent
 * until that is done. Otherwise it is live exactly when the action's gate is
 * open.
 */
export function ActionButton({
  session,
  gate,
  label,
  busy,
  onClick,
  size = "lg",
  variant = "primary",
  className,
}: {
  session: Session;
  /** The action's own gate. Read only once the session's is open. */
  gate: Gate;
  label: ReactNode;
  busy: boolean;
  onClick: () => void;
  size?: "sm" | "lg";
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { openConnectModal } = useConnectModal();
  const blocked = cn(buttonClasses({ variant: "secondary", size }), "border-border/70 bg-white/[0.035] text-steel-500 disabled:opacity-100");

  if (!session.gate.ok && session.gate.code === "NotConnected") {
    return (
      <button type="button" onClick={openConnectModal} className={cn(buttonClasses({ variant: "primary", size }), className)}>
        Connect wallet
      </button>
    );
  }
  if (!session.gate.ok && session.gate.code === "WrongNetwork") {
    // Warm, because a wallet on another chain cannot act on any of this.
    return (
      <button
        type="button"
        onClick={session.switchNetwork}
        className={cn(
          buttonClasses({ variant: "secondary", size }),
          "border-warn/45 bg-warn/10 text-warn hover:border-warn/60 hover:bg-warn/20",
          className,
        )}
      >
        Switch to {chain.name}
      </button>
    );
  }

  const refused = !session.gate.ok ? session.gate : !gate.ok ? gate : null;
  // A dimmed fill still reads as a live button, so the blocked state
  // drops the fill entirely rather than fading it.
  if (refused || busy || !session.clients) {
    return (
      <button type="button" disabled className={cn(blocked, className)}>
        {busy ? "Working…" : refused ? (BLOCKED[refused.code] ?? "Unavailable") : "Connecting…"}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(buttonClasses({ variant, size }), className)}>
      {label}
    </button>
  );
}

/**
 * The line under the button: why it is blocked, where a running action is,
 * and how it ended. A reason to stop is warm; progress and success are not.
 *
 * `pool` is the pool the action is about, where there is one: a reason that
 * reads differently for it is given in its words (`explainForPool`).
 */
export function ActionNote({
  session,
  gate,
  state,
  pool,
}: {
  session: Session;
  gate: Gate;
  state: ActionState;
  pool?: PoolInWords | null;
}) {
  const line = "px-1 text-[11px] leading-[17px]";

  if (state.status === "running") {
    return (
      <p role="status" className={cn(line, "text-steel-400")}>
        {state.step ? STEP[state.step.name][state.step.phase] : "Checking with the chain."}
      </p>
    );
  }
  if (state.status === "failed") {
    return (
      <p role="alert" className={cn(line, "text-warn")}>
        {explainForPool(state.error, pool).message}
      </p>
    );
  }

  const refused = !session.gate.ok ? session.gate : !gate.ok ? gate : null;
  const quiet = refused && ["NoAmount", "NotConnected"].includes(refused.code);
  return (
    <>
      {state.status === "done" && (
        <p role="status" className={cn(line, "text-steel-300")}>
          {state.summary}{" "}
          <a
            href={`${chain.blockExplorers.default.url}/tx/${state.hash}`}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex items-center gap-0.5 rounded text-brand-300 hover:text-brand-400"
          >
            View transaction
            <ArrowUpRight className="size-3" aria-hidden />
          </a>
        </p>
      )}
      {refused && !quiet && <p className={cn(line, "text-warn")}>{explainForPool(refused, pool).message}</p>}
    </>
  );
}
