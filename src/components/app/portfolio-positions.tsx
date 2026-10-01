"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { ActionButton, ActionNote, FEES_ARE_COLLATERAL } from "@/components/app/action-controls";
import { HoldingsLine, RangeLine } from "@/components/app/position-picker";
import { AssetMark, AssetPair } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { sanitizeAmount } from "@/components/ui/field";
import { hfLabel, hfTone } from "@/components/ui/health-bar";
import { fmtUsd, fmtUsdExact, fmtUsdg, orDash } from "@/lib/format";
import { COLLATERAL_POOLS, MARKETS, poolById, poolHref } from "@/lib/markets";
import { collectFees, repay, withdraw, withdrawCollateral } from "@/lib/onchain/actions";
import { samePool } from "@/lib/onchain/contracts";
import { describePosition, feesInWords } from "@/lib/onchain/describe";
import { explainForPool } from "@/lib/onchain/errors";
import { listState, unreadNote } from "@/lib/onchain/list-status";
import { collectFeesGate, repayGate, withdrawCollateralGate, withdrawGate, type Gate } from "@/lib/onchain/gates";
import { useAction, useLenderState, usePositions, useSession, useWalletPositions } from "@/lib/onchain/hooks";
import type { PositionState } from "@/lib/onchain/reads";
import type { MarketTier } from "@/lib/risk-params";
import { formatUsdg, healthFactorToNumber, parseUsdg, usdgToNumber, wadToNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * What a wallet holds in Farmenta, with the actions that take it out again:
 * withdrawing USDG from a market, repaying a loan and withdrawing its
 * collateral, and collecting the fees a deposited position has earned. Every
 * figure here is read from the chain.
 */
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
const poolOf = (position: PositionState) => poolById(position.poolId);

function BorrowPosition({ tier, position }: { tier: MarketTier; position: PositionState }) {
  const session = useSession();
  const action = useAction(tier);
  // One panel under the row at a time: the repayment's or the fees'.
  const [panel, setPanel] = useState<"repay" | "fees" | null>(null);
  const toggle = (next: "repay" | "fees") => {
    setPanel(panel === next ? null : next);
    action.reset();
  };

  const pool = poolOf(position);
  const { fee, feesUsd, fees } = describePosition(position);
  const exit = withdrawCollateralGate(position);
  const collect = collectFeesGate(position);
  // Left out while there is nothing to collect.
  const collectable = collect.ok || collect.code !== "NoFees";
  const feesNamed = pool ? feesInWords(fees, pool.base.symbol) : null;
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
              <span className="text-steel-400">{fee}</span>
            </p>
            <p className="text-[12px] text-steel-400">
              <RangeLine position={position} />
            </p>
            {position.holdings && (
              <p className="text-[12px] text-steel-400">
                <HoldingsLine position={position} />
              </p>
            )}
            <p className="text-[12px] text-steel-500">
              {marketName(tier)} market · <span className="font-mono">#{position.tokenId.toString()}</span>
            </p>
          </div>
        </div>
        <Figure label="Debt">{usdg(position.debt)}</Figure>
        <Figure label="Collateral">{position.risk ? fmtUsd(wadToNumber(position.risk.positionValue)) : "—"}</Figure>
        {/* In full. "Collateral" counts them up to a tenth of the principal, so the two differ. */}
        <Figure label="Uncollected fees">{orDash(feesUsd, fmtUsdExact)}</Figure>
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
              aria-expanded={panel === "repay"}
              onClick={() => toggle("repay")}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Repay
            </button>
          )}
          {collectable && (
            <button
              type="button"
              aria-expanded={panel === "fees"}
              onClick={() => toggle("fees")}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Collect fees
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
                "The position is back in your wallet.",
                (clients, refs, onStep) => withdrawCollateral(clients, refs, position.tokenId, onStep),
                position.poolId,
              )
            }
          />
        </div>
      </div>
      {position.riskError && (
        <p className="mt-3 text-[12px] leading-[18px] text-warn">
          {explainForPool(position.riskError, pool).message}{" "}
          {position.debt > 0n
            ? "Repaying does not need a price."
            : "Withdrawing collateral that owes nothing does not need a price."}
        </p>
      )}

      {panel === "fees" && collectable && (
        <div className="mt-4 border-t border-border/70 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="text-[12px] leading-[18px] text-steel-400">
              Both tokens go to your wallet, and the position stays deposited.
            </p>
            <ActionButton
              session={session}
              gate={collect}
              busy={action.busy}
              size="sm"
              label={feesNamed ? `Collect ${feesNamed}` : "Collect fees"}
              onClick={() =>
                void action.run(
                  "The fees are in your wallet.",
                  (clients, refs, onStep) => collectFees(clients, refs, position.tokenId, onStep),
                  position.poolId,
                )
              }
            />
          </div>
          {position.debt > 0n && <p className="mt-2 text-[11px] leading-[17px] text-warn">{FEES_ARE_COLLATERAL}</p>}
        </div>
      )}
      {panel === "repay" && position.debt > 0n && (
        <AmountAction
          id={`repay-${position.tokenId}`}
          label="Amount to repay, in USDG"
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
  const { fee, valueUsd, feesUsd } = describePosition(position);
  return (
    <div className="surface flex flex-wrap items-center justify-between gap-x-8 gap-y-4 p-5 sm:p-6">
      <div className="flex items-center gap-3">
        {pool && <AssetPair pair={pool.pair} size={28} />}
        <div>
          <p className="text-[14px] font-medium text-foreground">
            {pool ? pool.pair : "Uniswap v4 position"} <span className="text-steel-400">{fee}</span>
          </p>
          <p className="text-[12px] text-steel-400">
            <RangeLine position={position} />
          </p>
          <p className="text-[12px] text-steel-400">
            <HoldingsLine position={position} />
          </p>
          <p className="text-[12px] text-steel-500">
            In your wallet, not deposited · <span className="font-mono">#{position.tokenId.toString()}</span>
          </p>
        </div>
      </div>
      <Figure label="Value">{valueUsd === null ? "—" : fmtUsd(valueUsd)}</Figure>
      <Figure label="Uncollected fees">{orDash(feesUsd, fmtUsdExact)}</Figure>
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

/**
 * The wallet's loans and the positions it could borrow against, found in the
 * chain's logs. `empty` is what to show when there are none.
 *
 * Positions in the wallet are listed only for the pools the app has a page
 * for: a wallet can hold hundreds of positions in pools Farmenta does not
 * list, and none of them can be deposited.
 */
export function BorrowPositions({ empty }: { empty: ReactNode }) {
  const discovery = useWalletPositions();
  const found = (discovery.data ?? []).filter(
    (position) =>
      position.place === "collateral" || COLLATERAL_POOLS.some((pool) => samePool(pool.poolId, position.poolId)),
  );
  const tierOf = (position: (typeof found)[number]): MarketTier =>
    position.tier ?? COLLATERAL_POOLS.find((pool) => samePool(pool.poolId, position.poolId))!.tier;

  const blueChip = found.filter((position) => tierOf(position) === "blue-chip");
  const meme = found.filter((position) => tierOf(position) === "meme");
  const reads = [
    ...usePositions("blue-chip", blueChip.map((position) => position.tokenId)).map(
      (query) => ["blue-chip", query] as const,
    ),
    ...usePositions("meme", meme.map((position) => position.tokenId)).map((query) => ["meme", query] as const),
  ];
  const rows = reads
    .map(([tier, query]) => [tier, query.data] as const)
    .filter((row): row is readonly [MarketTier, PositionState] => row[1] !== undefined);
  const { status, unread } = listState({
    discovery: { isLoading: discovery.isLoading, isError: discovery.isError, hasData: discovery.data !== undefined },
    found: found.length,
    shown: rows.length,
    reading: reads.filter(([, query]) => query.isLoading).length,
    failed: reads.filter(([, query]) => query.isError && query.data === undefined).length,
  });

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[var(--radius-xl)] border border-border/70 px-5 py-9 text-center">
        <p className="text-[13px] text-warn">Couldn&apos;t load your positions. The network did not respond.</p>
        <button
          type="button"
          onClick={() => void discovery.refetch()}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          Try again
        </button>
      </div>
    );
  }
  if (status === "loading") return <p className="px-1 py-6 text-[13px] text-steel-500">Looking for your positions…</p>;
  if (rows.length === 0 && unread > 0) return <p className="px-1 py-6 text-[13px] text-warn">{unreadNote(unread)}</p>;
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="space-y-3">
      {rows.map(([tier, position]) =>
        position.place === "collateral" ? (
          <BorrowPosition key={position.tokenId.toString()} tier={tier} position={position} />
        ) : position.place === "wallet" ? (
          <WalletPosition key={position.tokenId.toString()} position={position} />
        ) : null,
      )}
      {unread > 0 && <p className="px-1 text-[12px] leading-[18px] text-warn">{unreadNote(unread)}</p>}
    </div>
  );
}
