"use client";

import { Info } from "lucide-react";

import { InfoList, InfoRow } from "@/components/ui/field";
import { failureMessage } from "@/lib/backend/client";
import { useMarket, usePoolFigures, type Figures } from "@/lib/backend/hooks";
import { compactParts, fmtPct, fmtUsd, fmtUsdg, NO_FIGURE, orDash } from "@/lib/format";
import { MARKETS, NETWORKS, type CollateralPool } from "@/lib/markets";
import { RISK_PARAMS } from "@/lib/risk-params";
import { cn } from "@/lib/utils";

/**
 * The figures of a pool's page, read from the backend (FAR-80).
 *
 * A figure that has not come yet is a dash that pulses, a figure the backend
 * does not have is a dash, and an empty market is a zero. When the backend
 * cannot be read the page says so once, above the figures, and the dashes
 * stay: no number ever stands in for the one that did not come.
 */

const usdg = (amount: number) => `${fmtUsdg(amount)} USDG`;
const percent = (value: number) => `${Number(value.toFixed(2))}%`;

/** A figure in a row, or the dash. Pulses while it is on its way. */
function Shown<T>({ figures, pick }: { figures: Figures<T>; pick: (data: T) => string }) {
  if (figures.status === "loading") return <span className="animate-pulse text-steel-500">{NO_FIGURE}</span>;
  if (figures.status === "failed") return <span className="text-steel-500">{NO_FIGURE}</span>;
  return <>{pick(figures.data)}</>;
}

/**
 * Says once why the figures are missing, or that the ones on screen may be
 * behind. Warm, because a reader is about to decide on what they see.
 */
export function FiguresNotice({ figures, className }: { figures: readonly Figures<unknown>[]; className?: string }) {
  const missing = figures.find((item) => item.status === "failed");
  const behind = figures.find((item) => item.status === "ready" && item.error !== null);
  if (!missing && !behind) return null;

  return (
    <p role="status" className={cn("text-[12.5px] leading-[19px] text-warn", className)}>
      {missing
        ? failureMessage(missing.error)
        : `These figures could not be refreshed and may be out of date. ${failureMessage(behind!.error)}`}
    </p>
  );
}

/**
 * One headline figure. Deliberately unboxed: rules and dividers around four
 * numbers read as a table of four things, when the point is the numbers.
 * The magnitude ("K", "M", "%") drops a shade so the digits carry the weight.
 */
function Metric({
  label,
  value,
  unit,
  sub,
  hint,
  pending,
}: {
  label: string;
  /** `null` when there is no figure. */
  value: string | null;
  unit: string;
  sub: string;
  hint: string;
  pending: boolean;
}) {
  return (
    <div>
      <div className="group/hint relative inline-flex items-center gap-1.5">
        <span className="text-[13px] text-steel-400">{label}</span>
        <Info className="size-3.5 shrink-0 text-steel-600" aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-60 rounded-lg border border-border bg-popover px-2.5 py-2 text-[11px] leading-[17px] text-steel-300 shadow-xl group-hover/hint:block"
        >
          {hint}
        </span>
      </div>
      <p
        className={cn(
          "font-display tnum mt-2 text-[30px] font-semibold leading-none sm:text-[34px]",
          value === null ? "text-steel-500" : "text-foreground",
          pending && "animate-pulse",
        )}
      >
        {value ?? NO_FIGURE}
        {value !== null && <span className="text-steel-500">{unit}</span>}
      </p>
      <p className="tnum mt-2.5 text-[12px] text-steel-500">{sub}</p>
    </div>
  );
}

/** A figure for `Metric`: the digits and the magnitude apart, or nothing. */
const amountOf = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return { value: null, unit: "" };
  const { figure, unit } = compactParts(amount);
  return { value: figure, unit };
};

const rateOf = (rate: number | null | undefined) =>
  rate === null || rate === undefined ? { value: null, unit: "" } : { value: rate.toFixed(2), unit: "%" };

/** The four figures a pool's page opens with. */
export function PoolHeadline({ pool }: { pool: CollateralPool }) {
  const market = MARKETS.find((item) => item.id === pool.tier)!;
  const figures = usePoolFigures(pool.poolId);
  const lending = useMarket(pool.tier);
  const latest = lending.data?.latest;

  return (
    <>
      <FiguresNotice figures={[figures, lending]} className="mb-7" />
      <section aria-label="Market activity" className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
        <Metric
          label="Total Borrow"
          {...amountOf(figures.data?.debtUsdg)}
          pending={figures.status === "loading"}
          sub="USDG borrowed from this pool"
          hint={`USDG borrowed against ${pool.pair} LP positions held by this pool.`}
        />
        <Metric
          label="Total Supply"
          {...amountOf(latest?.suppliedUsdg)}
          pending={lending.status === "loading"}
          sub={`USDG in the ${market.name} market`}
          hint={`USDG supplied to the ${market.name} market, which this pool and the others in it borrow from.`}
        />
        <Metric
          label="Borrow APR"
          {...rateOf(figures.data?.borrowAprPct)}
          pending={figures.status === "loading"}
          sub="Paid by borrowers"
          hint="Annualised borrowing cost at the current utilisation, from the kinked rate model."
        />
        <Metric
          label="Supply APY"
          {...rateOf(latest?.supplyApyPct)}
          pending={lending.status === "loading"}
          sub="Earned by USDG lenders"
          hint={`Annualised yield for USDG depositors in the ${market.name} market, after the ${RISK_PARAMS[pool.tier].reserveFactorPct}% reserve factor.`}
        />
      </section>
    </>
  );
}

/** The "Pool" tab: what the pool is, and how much of its market is in use. */
export function PoolFacts({ pool }: { pool: CollateralPool }) {
  const chain = NETWORKS[pool.network];
  const figures = usePoolFigures(pool.poolId);
  const lending = useMarket(pool.tier);

  return (
    <>
      <InfoList className="border-t-0">
        <InfoRow label="Network">
          {chain.name} · chain {chain.chainId}
        </InfoRow>
        <InfoRow label="Loan asset">USDG</InfoRow>
        <InfoRow label="Collateral">Uniswap v4 {pool.pair} LP NFT</InfoRow>
        <InfoRow label="Priced by">{RISK_PARAMS[pool.tier].priceSource}</InfoRow>
        <InfoRow label="Market utilization">
          <Shown figures={lending} pick={(data) => orDash(data?.latest?.utilizationPct, fmtPct)} />
        </InfoRow>
        <InfoRow label="Available to borrow">
          <Shown figures={figures} pick={(data) => orDash(data.availableToBorrowUsdg, usdg)} />
        </InfoRow>
        <InfoRow label="Status">
          <Shown figures={figures} pick={(data) => (data.terms.frozen ? "Frozen: no new collateral or loans" : "Open")} />
        </InfoRow>
      </InfoList>
      <div className="mt-5">
        <p className="label-xs">Pool ID</p>
        <p className="mt-2 break-all font-mono text-[12px] leading-[18px] text-steel-300">{pool.poolId}</p>
      </div>
    </>
  );
}

/**
 * The "Risk parameters" tab. The first six rows are this pool's own terms, as
 * listed on the chain: a pool may lend on tighter terms than its market's
 * preset, and the two stock pools do. The rest belong to the market.
 */
export function PoolRiskTerms({ pool }: { pool: CollateralPool }) {
  const market = RISK_PARAMS[pool.tier];
  const figures = usePoolFigures(pool.poolId);
  const term = (pick: (terms: NonNullable<typeof figures.data>["terms"]) => string) => (
    <Shown figures={figures} pick={(data) => pick(data.terms)} />
  );

  return (
    <InfoList className="border-t-0">
      <InfoRow label="Max LTV at borrow">{term((terms) => orDash(terms.maxLtvPct, fmtPct))}</InfoRow>
      <InfoRow label="Liquidation threshold">{term((terms) => orDash(terms.liquidationThresholdPct, fmtPct))}</InfoRow>
      <InfoRow label="Liquidator bonus">{term((terms) => orDash(terms.liquidatorBonusPct, fmtPct))}</InfoRow>
      <InfoRow label="Protocol liquidation fee">
        {term((terms) => orDash(terms.protocolLiquidationFeePct, (fee) => `${percent(fee)} of repay`))}
      </InfoRow>
      <InfoRow label="Debt cap, this pool">{term((terms) => orDash(terms.debtCapUsdg, usdg))}</InfoRow>
      <InfoRow label="Minimum position">{term((terms) => orDash(terms.minPositionUsd, fmtUsd))}</InfoRow>
      <InfoRow label="Close factor">{market.closeFactor}</InfoRow>
      <InfoRow label="Debt cap, whole market">{usdg(market.marketDebtCapUsd)}</InfoRow>
      <InfoRow label="Reserve factor">{market.reserveFactorPct}% of interest</InfoRow>
      <InfoRow label="Reserve floor">{market.reserveFloorPct}% of total assets</InfoRow>
      <InfoRow label="Interest rate model">
        kink {market.irm.kinkPct}% · slope {market.irm.slope1Pct}% / {market.irm.slope2Pct}%
      </InfoRow>
    </InfoList>
  );
}
