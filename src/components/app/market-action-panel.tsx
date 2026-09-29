"use client";

import { useState } from "react";

import { ActionButton, ActionNote, AmountField } from "@/components/app/action-controls";
import { PositionPicker, usePoolPositions } from "@/components/app/position-picker";
import { AssetMark, AssetPair } from "@/components/ui/asset-mark";
import { HealthBar, hfLabel, hfTone } from "@/components/ui/health-bar";
import { Segmented } from "@/components/ui/segmented";
import { useMarket, usePoolFigures } from "@/lib/backend/hooks";
import { fmtPct, fmtUsd, fmtUsdg, orDash } from "@/lib/format";
import { MARKETS, NETWORKS, type CollateralPool } from "@/lib/markets";
import { borrow, depositCollateral, repay, supply, withdraw, withdrawCollateral } from "@/lib/onchain/actions";
import {
  borrowGate,
  depositCollateralGate,
  repayGate,
  supplyGate,
  withdrawCollateralGate,
  withdrawGate,
  type Gate,
} from "@/lib/onchain/gates";
import { useAction, useLenderState, useSession } from "@/lib/onchain/hooks";
import { previewLoan } from "@/lib/onchain/preview";
import { RISK_PARAMS } from "@/lib/risk-params";
import { bpsToFraction, formatUsdg, parseUsdg, usdgToNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * The action rail on a pool page.
 *
 * The two tabs are deliberately not symmetrical, because the protocol is not.
 * Borrowing is per pool: a specific Uniswap v4 position NFT backs a specific
 * loan, so the first card picks a position rather than typing an amount, and
 * the summary is about that one loan's health. Supplying is per *market*: USDG
 * funds every pool in the tier and shares its bad debt (spec §1 no. 8), so that
 * tab says so and reports market-wide figures instead.
 *
 * Every figure a transaction is sized from (balances, the withdrawable amount,
 * the debt, the borrowing room, the health factor) is read from the chain. The
 * rates and the utilisation are read from the backend, and are a dash while
 * it cannot be read; the actions do not wait for them.
 */
type Tab = "borrow" | "supply";

/** Shown while a gate has no state to decide on yet. */
const LOADING: Gate = { ok: false, code: "Loading", message: "" };

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-white/[0.02] px-4 py-4", className)}>
      {children}
    </div>
  );
}

function CardHead({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px]">
      <span className="text-[12.5px] text-steel-400">{label}</span>
      <span className="tnum text-right text-[12.5px] font-medium text-foreground">{children}</span>
    </div>
  );
}

function Network({ pool }: { pool: CollateralPool }) {
  return (
    <Row label="Network">
      <span className="inline-flex items-center gap-1.5">
        <AssetMark asset={pool.network} size={14} /> {NETWORKS[pool.network].name}
      </span>
    </Row>
  );
}

const usdg = (amount: bigint | undefined) => (amount === undefined ? "—" : `${fmtUsdg(usdgToNumber(amount))} USDG`);

function SupplySide({ pool }: { pool: CollateralPool }) {
  const market = MARKETS.find((item) => item.id === pool.tier)!;
  const risk = RISK_PARAMS[pool.tier];
  const session = useSession();
  const lending = useMarket(pool.tier).data?.latest;
  const { data: state } = useLenderState(pool.tier);
  const action = useAction(pool.tier);

  const [mode, setMode] = useState<"supply" | "withdraw">("supply");
  const [text, setText] = useState("");
  const amount = parseUsdg(text);

  const supplying = mode === "supply";
  const limit = supplying ? state?.balance : state?.maxWithdraw;
  const gate = !state ? LOADING : supplying ? supplyGate(state, amount) : withdrawGate(state, amount);
  const over = !gate.ok && ["InsufficientBalance", "ERC4626ExceededMaxWithdraw"].includes(gate.code);

  const change = (next: string) => {
    setText(next);
    action.reset();
  };
  const submit = async () => {
    if (amount === null) return;
    const figure = `${fmtUsdg(usdgToNumber(amount))} USDG`;
    const receipt = supplying
      ? await action.run(`Supplied ${figure}.`, (clients, refs, onStep) => supply(clients, refs, amount, onStep))
      : await action.run(`Withdrew ${figure}.`, (clients, refs, onStep) => withdraw(clients, refs, amount, onStep));
    if (receipt) setText("");
  };

  return (
    <>
      <Card>
        <CardHead title={supplying ? "Supply USDG" : "Withdraw USDG"}>
          <Segmented
            label="Supply or withdraw"
            value={mode}
            options={[
              { id: "supply", label: "Supply" },
              { id: "withdraw", label: "Withdraw" },
            ]}
            onChange={(next) => {
              setMode(next);
              change("");
            }}
          />
        </CardHead>
        <AmountField
          id="supply-amount"
          label={supplying ? "Amount to supply, in USDG" : "Amount to withdraw, in USDG"}
          value={text}
          onChange={change}
          limitLabel={usdg(limit)}
          onMax={() => change(limit === undefined ? "" : formatUsdg(limit))}
          disabled={!state || action.busy}
          invalid={over}
        />
      </Card>

      <Card>
        <Network pool={pool} />
        <Row label="Market">{market.name}</Row>
        <Row label="Supply APY">
          <span className="text-brand-300">{orDash(lending?.supplyApyPct, fmtPct)}</span>
        </Row>
        <Row label="Utilization">{orDash(lending?.utilizationPct, fmtPct)}</Row>
        <Row label="Your deposit">{usdg(state?.deposited)}</Row>
        {/* Idle USDG in the market, read from the chain: what lenders can take out between
            them right now. There is no per-pool liquidity to subtract a pool's debt from. */}
        <Row label="Available liquidity">{usdg(state?.cash)}</Row>
        <Row label="Reserve factor">{risk.reserveFactorPct}% of interest</Row>
        <Row label="Reserve floor">{risk.reserveFloorPct}% of total assets</Row>
      </Card>

      <ActionButton
        session={session}
        gate={gate}
        busy={action.busy}
        onClick={submit}
        label={`${supplying ? "Supply" : "Withdraw"} ${amount ? fmtUsdg(usdgToNumber(amount)) : ""} USDG`}
        className="w-full"
      />
      <ActionNote session={session} gate={gate} state={action.state} />
    </>
  );
}

function BorrowSide({ pool }: { pool: CollateralPool }) {
  const session = useSession();
  const action = useAction(pool.tier);
  const figures = usePoolFigures(pool.poolId).data;
  const list = usePoolPositions(pool);
  const { positions } = list;

  const [picked, setPicked] = useState<bigint | null>(null);
  const [mode, setMode] = useState<"borrow" | "repay">("borrow");
  const [text, setText] = useState("");
  // The first position is the selection until the user makes one.
  const position = positions.find((item) => item.tokenId === picked) ?? positions[0] ?? null;
  const tokenId = position?.tokenId ?? null;

  const amount = parseUsdg(text);
  const held = position?.place === "collateral";
  const borrowing = mode === "borrow";

  const gate: Gate = !position
    ? {
        ok: false,
        code: list.status === "loading" ? "Loading" : list.status === "failed" ? "PositionsUnavailable" : "NoPosition",
        message: "",
      }
    : !held
      ? depositCollateralGate(position, pool.poolId)
      : borrowing
        ? borrowGate(position, amount)
        : repayGate(position, amount);
  const exit = position && held ? withdrawCollateralGate(position) : LOADING;

  const limit = !position || !held ? undefined : borrowing ? position.risk?.maxBorrow : position.debt;
  const over = !gate.ok && ["BorrowExceedsMaxLtv", "InsufficientBalance"].includes(gate.code);
  const preview = position && held ? previewLoan(position, borrowing ? (amount ?? 0n) : -(amount ?? 0n)) : null;
  // The pool's own threshold: from the chain once a position is read, from the backend until then.
  const liquidationLtvPct =
    preview !== null
      ? preview.liquidationLtv * 100
      : position?.pool.terms
        ? bpsToFraction(position.pool.terms.ltBps) * 100
        : (figures?.terms.liquidationThresholdPct ?? null);

  const change = (next: string) => {
    setText(next);
    action.reset();
  };
  const pick = (next: bigint) => {
    setPicked(next);
    setMode("borrow");
    change("");
  };

  const submit = async () => {
    if (!position || tokenId === null) return;
    if (!held) {
      await action.run(
        "The position is deposited.",
        (clients, refs, onStep) => depositCollateral(clients, refs, tokenId, onStep),
        pool.poolId,
      );
      return;
    }
    if (amount === null) return;
    const figure = `${fmtUsdg(usdgToNumber(amount))} USDG`;
    // Repaying the whole debt goes out as "max", so interest accruing until the
    // transaction is mined leaves no dust behind.
    const all = !borrowing && amount >= position.debt;
    const receipt = borrowing
      ? await action.run(`Borrowed ${figure}.`, (clients, refs, onStep) => borrow(clients, refs, tokenId, amount, onStep), pool.poolId)
      : await action.run(
          all ? "Repaid the loan in full." : `Repaid ${figure}.`,
          (clients, refs, onStep) => repay(clients, refs, tokenId, all ? "max" : amount, onStep),
          pool.poolId,
        );
    if (receipt) setText("");
  };

  const takeBack = async () => {
    if (tokenId === null) return;
    await action.run(
      "The position is back in your wallet.",
      (clients, refs, onStep) => withdrawCollateral(clients, refs, tokenId, onStep),
      pool.poolId,
    );
  };

  return (
    <>
      <Card>
        <CardHead title="Collateral position">
          <AssetPair pair={pool.pair} size={20} />
        </CardHead>
        <PositionPicker pool={pool} list={list} selected={tokenId} onSelect={pick} />
      </Card>

      {held && (
        <Card>
          <CardHead title={borrowing ? "Borrow USDG" : "Repay USDG"}>
            <Segmented
              label="Borrow or repay"
              value={mode}
              options={[
                { id: "borrow", label: "Borrow" },
                { id: "repay", label: "Repay" },
              ]}
              onChange={(next) => {
                setMode(next);
                change("");
              }}
            />
          </CardHead>
          <AmountField
            id="borrow-amount"
            label={borrowing ? "Amount to borrow, in USDG" : "Amount to repay, in USDG"}
            value={text}
            onChange={change}
            limitLabel={usdg(limit)}
            onMax={() => change(limit === undefined ? "" : formatUsdg(limit))}
            disabled={action.busy || limit === undefined || limit === 0n}
            invalid={over}
          />
        </Card>
      )}

      <Card>
        <Network pool={pool} />
        <Row label="Loan (USDG)">{preview ? fmtUsdg(preview.debt) : held ? fmtUsdg(usdgToNumber(position.debt)) : "—"}</Row>
        <Row label={`Collateral (${pool.pair})`}>{preview ? fmtUsd(preview.collateralUsd) : "—"}</Row>
        <Row label="LTV">{preview ? `${(preview.ltv * 100).toFixed(2)}%` : "—"}</Row>
        <Row label="Liquidation LTV">{orDash(liquidationLtvPct, (value) => `${value.toFixed(0)}%`)}</Row>
        <Row label="Health factor">
          {preview && preview.debt > 0 ? (
            <span
              className={cn(
                hfTone(preview.healthFactor) === "ok"
                  ? "text-brand-300"
                  : hfTone(preview.healthFactor) === "warn"
                    ? "text-warn"
                    : "text-danger",
              )}
            >
              {hfLabel(preview.healthFactor)}
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Rate">{orDash(figures?.borrowAprPct, fmtPct)}</Row>
        {preview && preview.debt > 0 && <HealthBar hf={preview.healthFactor} className="mt-2.5" />}
      </Card>

      <ActionButton
        session={session}
        gate={gate}
        busy={action.busy}
        onClick={submit}
        label={
          !held
            ? "Deposit as collateral"
            : `${borrowing ? "Borrow" : "Repay"} ${amount ? fmtUsdg(usdgToNumber(amount)) : ""} USDG`
        }
        className="w-full"
      />
      {held && (
        <ActionButton
          session={session}
          gate={exit}
          busy={action.busy}
          onClick={takeBack}
          variant="secondary"
          label="Withdraw collateral to your wallet"
          className="w-full"
        />
      )}
      <ActionNote
        session={session}
        gate={gate.ok || ["NoPosition", "Loading", "PositionsUnavailable"].includes(gate.code) ? { ok: true } : gate}
        state={action.state}
        pool={pool}
      />
    </>
  );
}

export function MarketActionPanel({ pool }: { pool: CollateralPool }) {
  const [tab, setTab] = useState<Tab>("borrow");

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Market action" className="inline-flex rounded-xl bg-white/[0.04] p-1">
        {(["borrow", "supply"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "focus-ring rounded-lg px-4 py-1.5 text-[13px] font-medium capitalize transition-colors",
              tab === value ? "bg-white/[0.1] text-foreground" : "text-steel-400 hover:text-foreground",
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {tab === "borrow" ? <BorrowSide pool={pool} /> : <SupplySide pool={pool} />}
    </div>
  );
}
