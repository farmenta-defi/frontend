"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { ActionButton, ActionNote } from "@/components/app/action-controls";
import { AssetMark, AssetPair } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { sanitizeAmount } from "@/components/ui/field";
import { hfLabel, hfTone } from "@/components/ui/health-bar";
import { COLLATERAL_POOLS, fmtUsd, fmtUsdg, MARKETS, poolHref } from "@/lib/markets";
import { repay, withdraw, withdrawCollateral } from "@/lib/onchain/actions";
import { samePool } from "@/lib/onchain/contracts";
import { explainError } from "@/lib/onchain/errors";
import { repayGate, withdrawCollateralGate, withdrawGate, type Gate } from "@/lib/onchain/gates";
import {
  marketRefs,
  useAction,
  useLenderState,
  usePositions,
  useSession,
  useTrackedPositions,
} from "@/lib/onchain/hooks";
import { readPosition, type PositionState } from "@/lib/onchain/reads";
import { parseTokenId } from "@/lib/onchain/tracked-positions";
import { chainKeys } from "@/lib/query-keys";
import type { MarketTier } from "@/lib/risk-params";
import { formatUsdg, healthFactorToNumber, parseUsdg, usdgToNumber, wadToNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * What a wallet holds in Farmenta, with the two actions that take it out
 * again: withdrawing USDG from a market, and repaying a loan and withdrawing
 * its collateral. Every figure here is read from the chain.
 */
const TIERS = MARKETS.map((market) => market.id);
const marketName = (tier: MarketTier) => MARKETS.find((market) => market.id === tier)!.name;
const usdg = (amount: bigint) => `${fmtUsdg(usdgToNumber(amount))} USDG`;

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[12px] text-steel-500">{label}</p>
      <p className="tnum mt-1 text-[14px] font-medium text-foreground">{children}</p>
    </div>
  );
}

/** An amount, MAX, and the button that sends it, on one line. */
function AmountAction({
  id,
  label,
  limit,
  gateOf,
  verb,
  busy,
  onSubmit,
}: {
  id: string;
  label: string;
  /** What MAX fills in. */
  limit: bigint;
  gateOf: (amount: bigint | null) => Gate;
  verb: string;
  busy: boolean;
  onSubmit: (amount: bigint) => Promise<boolean>;
}) {
  const session = useSession();
  const [text, setText] = useState("");
  const amount = parseUsdg(text);
  const gate = gateOf(amount);

  return (
    <div className="mt-4 border-t border-border/70 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          id={id}
          inputMode="decimal"
          placeholder="0.00"
          value={text}
          disabled={busy}
          aria-invalid={!gate.ok && gate.code !== "NoAmount"}
          onChange={(event) => setText(sanitizeAmount(event.target.value))}
          className="focus-ring tnum h-9 min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 text-[14px] text-foreground outline-none placeholder:text-steel-600 disabled:opacity-45"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => setText(formatUsdg(limit))}
          className="focus-ring h-9 rounded-lg bg-white/[0.07] px-3 text-[11px] font-medium tracking-wide text-steel-300 transition-colors hover:bg-white/[0.12] hover:text-foreground disabled:opacity-40"
        >
          MAX
        </button>
        <ActionButton
          session={session}
          gate={gate}
          busy={busy}
          size="sm"
          label={verb}
          onClick={async () => {
            if (amount !== null && (await onSubmit(amount))) setText("");
          }}
        />
      </div>
      {!gate.ok && !["NoAmount"].includes(gate.code) && session.gate.ok && (
        <p className="mt-2 text-[11px] leading-[17px] text-warn">{gate.message}</p>
      )}
    </div>
  );
}

/** The wallet's deposit in one market, read from the chain, or `null` while there is none to show. */
export function useDeposit(tier: MarketTier) {
  const { data } = useLenderState(tier);
  return data ?? null;
}

export function SupplyPosition({ tier }: { tier: MarketTier }) {
  const session = useSession();
  const state = useDeposit(tier);
  const action = useAction(tier);
  const [open, setOpen] = useState(false);

  if (!state || state.deposited === 0n) return null;

  const lentOut = state.maxWithdraw < state.deposited;
  return (
    <div className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex items-center gap-3">
          <AssetMark asset="USDG" size={28} />
          <div>
            <p className="text-[14px] font-medium text-foreground">USDG</p>
            <p className="text-[12px] text-steel-500">{marketName(tier)} market</p>
          </div>
        </div>
        <Figure label="Deposited">{usdg(state.deposited)}</Figure>
        <Figure label="Withdrawable now">{usdg(state.maxWithdraw)}</Figure>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            action.reset();
          }}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          Withdraw
        </button>
      </div>
      {lentOut && (
        <p className="mt-3 text-[12px] leading-[18px] text-steel-500">
          The rest is lent out. It becomes withdrawable as borrowers repay or lenders supply.
        </p>
      )}

      {open && (
        <>
          <AmountAction
            id={`withdraw-${tier}`}
            label={`Amount to withdraw from the ${marketName(tier)} market, in USDG`}
            limit={state.maxWithdraw}
            gateOf={(amount) => withdrawGate(state, amount)}
            verb="Withdraw"
            busy={action.busy}
            onSubmit={async (amount) =>
              Boolean(
                await action.run(`Withdrew ${usdg(amount)}.`, (clients, refs, onStep) =>
                  withdraw(clients, refs, amount, onStep),
                ),
              )
            }
          />
          <div className="mt-2">
            <ActionNote session={session} gate={{ ok: true }} state={action.state} />
          </div>
        </>
      )}
    </div>
  );
}

/** The pool a position belongs to, when the app lists it. */
const poolOf = (position: PositionState) =>
  COLLATERAL_POOLS.find((pool) => position.poolId !== null && samePool(pool.poolId, position.poolId)) ?? null;

function BorrowPosition({ tier, position }: { tier: MarketTier; position: PositionState }) {
  const session = useSession();
  const action = useAction(tier);
  const [open, setOpen] = useState(false);

  const pool = poolOf(position);
  const exit = withdrawCollateralGate(position);
  const healthFactor = position.risk ? healthFactorToNumber(position.risk.healthFactor) : null;
  const tone = healthFactor === null ? null : hfTone(healthFactor);

  return (
    <div className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex items-center gap-3">
          {pool && <AssetPair pair={pool.pair} size={28} />}
          <div>
            <p className="text-[14px] font-medium text-foreground">
              {pool ? (
                <Link href={poolHref(pool)} className="focus-ring rounded hover:text-brand-300">
                  {pool.pair}
                </Link>
              ) : (
                "Uniswap v4 position"
              )}{" "}
              <span className="font-mono text-[12px] text-steel-400">#{position.tokenId.toString()}</span>
            </p>
            <p className="text-[12px] text-steel-500">{marketName(tier)} market</p>
          </div>
        </div>
        <Figure label="Debt">{usdg(position.debt)}</Figure>
        <Figure label="Collateral">{position.risk ? fmtUsd(wadToNumber(position.risk.positionValue)) : "—"}</Figure>
        <Figure label="Health factor">
          {healthFactor === null || position.debt === 0n ? (
            "—"
          ) : (
            <span className={cn(tone === "ok" ? "text-brand-300" : tone === "warn" ? "text-warn" : "text-danger")}>
              {hfLabel(healthFactor)}
            </span>
          )}
        </Figure>
        <div className="flex flex-wrap items-center gap-2">
          {position.debt > 0n && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => {
                setOpen(!open);
                action.reset();
              }}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Repay
            </button>
          )}
          <ActionButton
            session={session}
            gate={exit}
            busy={action.busy}
            size="sm"
            variant="secondary"
            label="Withdraw collateral"
            onClick={() =>
              void action.run(
                `Position #${position.tokenId} is back in your wallet.`,
                (clients, refs, onStep) => withdrawCollateral(clients, refs, position.tokenId, onStep),
                position.poolId,
              )
            }
          />
        </div>
      </div>
      {position.riskError && (
        <p className="mt-3 text-[12px] leading-[18px] text-warn">
          {position.riskError.message} Repaying and withdrawing do not need a price.
        </p>
      )}

      {open && position.debt > 0n && (
        <AmountAction
          id={`repay-${position.tokenId}`}
          label={`Amount to repay on position ${position.tokenId}, in USDG`}
          limit={position.debt}
          gateOf={(amount) => repayGate(position, amount)}
          verb="Repay"
          busy={action.busy}
          onSubmit={async (amount) => {
            // The whole debt goes out as "max", so interest accruing until the
            // transaction is mined leaves no dust behind.
            const all = amount >= position.debt;
            return Boolean(
              await action.run(
                all ? "Repaid the loan in full." : `Repaid ${usdg(amount)}.`,
                (clients, refs, onStep) => repay(clients, refs, position.tokenId, all ? "max" : amount, onStep),
                position.poolId,
              ),
            );
          }}
        />
      )}
      <div className="mt-2">
        <ActionNote session={session} gate={{ ok: true }} state={action.state} />
      </div>
    </div>
  );
}

/** A position that is still in the wallet: nothing to repay, and the pool's page deposits it. */
function WalletPosition({ position }: { position: PositionState }) {
  const pool = poolOf(position);
  return (
    <div className="surface flex flex-wrap items-center justify-between gap-x-8 gap-y-4 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        {pool && <AssetPair pair={pool.pair} size={28} />}
        <div>
          <p className="text-[14px] font-medium text-foreground">
            {pool ? pool.pair : "Uniswap v4 position"}{" "}
            <span className="font-mono text-[12px] text-steel-400">#{position.tokenId.toString()}</span>
          </p>
          <p className="text-[12px] text-steel-500">In your wallet, not deposited</p>
        </div>
      </div>
      {pool ? (
        <Link href={poolHref(pool)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Deposit on the {pool.pair} page
        </Link>
      ) : (
        <Badge tone="neutral">Pool not listed</Badge>
      )}
    </div>
  );
}

/** Adds a position to the list by its token id, once the chain confirms it is the wallet's. */
function AddPosition() {
  const session = useSession();
  const queryClient = useQueryClient();
  const tracked = useTrackedPositions();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const ready = Boolean(marketRefs("blue-chip") && session.account && session.publicClient);

  const add = async () => {
    const tokenId = parseTokenId(text);
    if (tokenId === null) return setNote("Enter the position's token id, a whole number.");
    const { publicClient, account } = session;
    if (!publicClient || !account) return;

    setLooking(true);
    setNote(null);
    try {
      const found = await Promise.all(
        TIERS.map((tier) =>
          queryClient.fetchQuery({
            queryKey: chainKeys.position(tier, tokenId, account),
            queryFn: () => readPosition(publicClient, marketRefs(tier)!, tokenId, account),
          }),
        ),
      );
      if (found.every((position) => position.place === "missing")) return setNote(`Position #${tokenId} does not exist.`);
      if (!found.some((position) => position.place === "wallet" || position.place === "collateral")) {
        return setNote(`Position #${tokenId} is not in your wallet and is not your collateral.`);
      }
      tracked.add(tokenId);
      setText("");
    } catch (error) {
      setNote(explainError(error).message);
    } finally {
      setLooking(false);
    }
  };

  return (
    <div>
      <form
        className="flex max-w-sm items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label htmlFor="portfolio-token-id" className="sr-only">
          Token id of a position to add
        </label>
        <input
          id="portfolio-token-id"
          inputMode="numeric"
          placeholder="Add a position by token id"
          value={text}
          disabled={!ready || looking}
          onChange={(event) => {
            setText(event.target.value.replace(/[^0-9]/g, ""));
            setNote(null);
          }}
          className="focus-ring tnum h-9 min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 font-mono text-[12px] text-foreground outline-none placeholder:font-sans placeholder:text-steel-600 disabled:opacity-45"
        />
        <button
          type="submit"
          disabled={!ready || looking || text === ""}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          {looking ? "Looking…" : "Add"}
        </button>
      </form>
      {note && <p className="mt-2 text-[11px] leading-[17px] text-warn">{note}</p>}
    </div>
  );
}

/**
 * The wallet's loans and the positions it could borrow against. `empty` is
 * what to show when there are none.
 */
export function BorrowPositions({ empty }: { empty: ReactNode }) {
  const { tokenIds } = useTrackedPositions();
  const blueChip = usePositions("blue-chip", tokenIds);
  const meme = usePositions("meme", tokenIds);

  const rows = tokenIds.flatMap((tokenId, index) => {
    const found: [MarketTier, PositionState | undefined][] = [
      ["blue-chip", blueChip[index]?.data],
      ["meme", meme[index]?.data],
    ];
    const held = found.find(([, position]) => position?.place === "collateral");
    if (held) return [{ tokenId, tier: held[0], position: held[1]! }];
    const inWallet = found.find(([, position]) => position?.place === "wallet");
    return inWallet ? [{ tokenId, tier: inWallet[0], position: inWallet[1]! }] : [];
  });

  return (
    <div className="space-y-3">
      <AddPosition />
      {rows.length === 0
        ? empty
        : rows.map(({ tokenId, tier, position }) =>
            position.place === "collateral" ? (
              <BorrowPosition key={tokenId.toString()} tier={tier} position={position} />
            ) : (
              <WalletPosition key={tokenId.toString()} position={position} />
            ),
          )}
    </div>
  );
}
