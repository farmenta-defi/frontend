"use client";

import { useState } from "react";

import { AssetMark, AssetPair } from "@/components/ui/asset-mark";
import { buttonClasses } from "@/components/ui/button";
import { parseAmount, sanitizeAmount } from "@/components/ui/field";
import { HealthBar, hfLabel, hfTone } from "@/components/ui/health-bar";
import {
  fmtUsd,
  fmtUsdExact,
  fmtUsdg,
  MARKETS,
  MOCK_POSITIONS,
  MOCK_USDG_BALANCE,
  NETWORKS,
  type CollateralPool,
} from "@/lib/markets";
import { RISK_PARAMS } from "@/lib/risk-params";
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
 */
type Tab = "borrow" | "supply";

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

/** Big figure, then the two footnotes the reference puts under it: value left, balance and MAX right. */
function AmountField({
  id,
  label,
  value,
  onChange,
  usd,
  limitLabel,
  onMax,
  disabled,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  usd: number;
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
        <span className="tnum text-[12px] text-steel-500">{fmtUsdExact(usd)}</span>
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

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px]">
      <span className="text-[12.5px] text-steel-400">{label}</span>
      <span className="tnum text-right text-[12.5px] font-medium text-foreground">{children}</span>
    </div>
  );
}

export function MarketActionPanel({ pool }: { pool: CollateralPool }) {
  const market = MARKETS.find((item) => item.id === pool.tier)!;
  const risk = RISK_PARAMS[pool.tier];
  const chain = NETWORKS[pool.network];
  const positions = MOCK_POSITIONS.filter((item) => item.pair === pool.pair);

  const [tab, setTab] = useState<Tab>("borrow");
  const [tokenId, setTokenId] = useState<number | null>(positions[0]?.tokenId ?? null);
  const [borrowAmount, setBorrowAmount] = useState("");
  const [supplyAmount, setSupplyAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const position = positions.find((item) => item.tokenId === tokenId) ?? null;
  const borrowValue = parseAmount(borrowAmount);
  const supplyValue = parseAmount(supplyAmount);

  // Existing debt counts: the panel adds to a loan rather than opening a fresh one.
  const currentDebt = position?.borrowedUsd ?? 0;
  const headroom = position ? Math.max(position.valueUsd * risk.maxLtv - currentDebt, 0) : 0;
  const totalDebt = currentDebt + borrowValue;
  const ltv = position && totalDebt > 0 ? totalDebt / position.valueUsd : 0;
  const healthFactor =
    position && totalDebt > 0 ? (position.valueUsd * risk.liqThreshold) / totalDebt : Infinity;

  const borrowTooBig = borrowValue > headroom;
  const supplyTooBig = supplyValue > MOCK_USDG_BALANCE;
  const availableUsd = pool.liquidityUsd - pool.totalBorrowUsd;

  const borrowCta = !position
    ? "Select a position"
    : headroom <= 0
      ? "No borrowing headroom"
      : borrowTooBig
        ? "Over the max LTV"
        : borrowValue > 0
          ? `Borrow ${fmtUsdg(borrowValue)} USDG`
          : "Enter an amount";
  const supplyCta = supplyTooBig
    ? "Insufficient balance"
    : supplyValue > 0
      ? `Supply ${fmtUsdg(supplyValue)} USDG`
      : "Enter an amount";

  const borrowReady = Boolean(position) && borrowValue > 0 && !borrowTooBig && headroom > 0;
  const supplyReady = supplyValue > 0 && !supplyTooBig;
  const ready = tab === "borrow" ? borrowReady : supplyReady;

  const switchTab = (next: Tab) => {
    setTab(next);
    setSubmitted(false);
  };

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Market action" className="inline-flex rounded-xl bg-white/[0.04] p-1">
        {(["borrow", "supply"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => switchTab(value)}
            className={cn(
              "focus-ring rounded-lg px-4 py-1.5 text-[13px] font-medium capitalize transition-colors",
              tab === value ? "bg-white/[0.1] text-foreground" : "text-steel-400 hover:text-foreground",
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {tab === "borrow" ? (
        <>
          <Card>
            <CardHead title="Collateral position">
              <AssetPair pair={pool.pair} size={20} />
            </CardHead>
            {positions.length ? (
              <div className="mt-3 space-y-1.5">
                {positions.map((item) => {
                  const active = item.tokenId === position?.tokenId;
                  return (
                    <button
                      key={item.tokenId}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setTokenId(item.tokenId);
                        setBorrowAmount("");
                        setSubmitted(false);
                      }}
                      className={cn(
                        "focus-ring flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-brand-400/50 bg-brand-400/[0.07]"
                          : "border-border hover:bg-white/[0.04]",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block font-mono text-[12px] text-foreground">#{item.tokenId}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-steel-500">
                          {item.range} range · {item.inRange ? "in range" : "out of range"}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-[13px] font-semibold text-foreground">
                        {fmtUsd(item.valueUsd)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-[12px] leading-[19px] text-steel-500">
                No eligible {pool.pair} position in this wallet. Deposit a Uniswap v4 position to
                borrow against it.
              </p>
            )}
          </Card>

          <Card>
            <CardHead title="Borrow USDG">
              <AssetMark asset="USDG" size={20} />
            </CardHead>
            <AmountField
              id="borrow-amount"
              label="Amount to borrow, in USDG"
              value={borrowAmount}
              onChange={(next) => {
                setBorrowAmount(next);
                setSubmitted(false);
              }}
              usd={borrowValue}
              limitLabel={`${fmtUsdg(headroom)} USDG`}
              onMax={() => setBorrowAmount(String(Math.floor(headroom * 100) / 100))}
              disabled={!position || headroom <= 0}
              invalid={borrowTooBig}
            />
          </Card>

          <Card>
            <Row label="Network">
              <span className="inline-flex items-center gap-1.5">
                <AssetMark asset={pool.network} size={14} /> {chain.name}
              </span>
            </Row>
            <Row label="Loan (USDG)">{fmtUsdg(totalDebt)}</Row>
            <Row label={`Collateral (${pool.pair})`}>
              {position ? fmtUsd(position.valueUsd) : "—"}
            </Row>
            <Row label="LTV">{position ? `${(ltv * 100).toFixed(2)}%` : "—"}</Row>
            <Row label="Liquidation LTV">{(risk.liqThreshold * 100).toFixed(0)}%</Row>
            <Row label="Health factor">
              {position && totalDebt > 0 ? (
                <span
                  className={cn(
                    hfTone(healthFactor) === "ok"
                      ? "text-brand-300"
                      : hfTone(healthFactor) === "warn"
                        ? "text-warn"
                        : "text-danger",
                  )}
                >
                  {hfLabel(healthFactor)}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Rate">{pool.borrowAprPct.toFixed(2)}%</Row>
            {position && totalDebt > 0 && <HealthBar hf={healthFactor} className="mt-2.5" />}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHead title="Supply USDG">
              <AssetMark asset="USDG" size={20} />
            </CardHead>
            <AmountField
              id="supply-amount"
              label="Amount to supply, in USDG"
              value={supplyAmount}
              onChange={(next) => {
                setSupplyAmount(next);
                setSubmitted(false);
              }}
              usd={supplyValue}
              limitLabel={`${fmtUsdg(MOCK_USDG_BALANCE)} USDG`}
              onMax={() => setSupplyAmount(String(MOCK_USDG_BALANCE))}
              invalid={supplyTooBig}
            />
          </Card>

          <Card>
            <Row label="Network">
              <span className="inline-flex items-center gap-1.5">
                <AssetMark asset={pool.network} size={14} /> {chain.name}
              </span>
            </Row>
            <Row label="Market">{market.name}</Row>
            <Row label="Supply APY">
              <span className="text-brand-300">{market.supplyApy.toFixed(2)}%</span>
            </Row>
            <Row label="Utilization">
              {((pool.totalBorrowUsd / pool.liquidityUsd) * 100).toFixed(1)}%
            </Row>
            <Row label="Available liquidity">{fmtUsd(availableUsd)}</Row>
            <Row label="Reserve factor">{risk.reserveFactorPct}% of interest</Row>
            <Row label="Reserve floor">{risk.reserveFloorPct}% of total assets</Row>
          </Card>
        </>
      )}

      {/* A dimmed gradient still reads as a live button, so the blocked state
          drops the gradient entirely rather than fading it. */}
      <button
        type="button"
        disabled={!ready}
        onClick={() => setSubmitted(true)}
        className={cn(
          buttonClasses({ variant: ready ? "primary" : "secondary", size: "lg" }),
          "w-full",
          !ready && "border-border/70 bg-white/[0.035] text-steel-500 disabled:opacity-100",
        )}
      >
        {tab === "borrow" ? borrowCta : supplyCta}
      </button>

      {submitted && (
        <p className="px-1 text-[11px] leading-[17px] text-steel-500">
          Demo only: nothing was signed and no transaction was sent. The FarmentaMarket contracts
          are not deployed yet, so every figure in this panel is simulated.
        </p>
      )}
    </div>
  );
}
