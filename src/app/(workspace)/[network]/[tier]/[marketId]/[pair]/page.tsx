import { ArrowLeft, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketActionPanel } from "@/components/app/market-action-panel";
import { PoolActivity } from "@/components/app/pool-activity";
import { PoolMarketChart } from "@/components/app/pool-market-chart";
import { PoolRates } from "@/components/app/pool-rates";
import { AssetMark, AssetPair } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { InfoList, InfoRow } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { fmtUsd } from "@/lib/format";
import { COLLATERAL_POOLS, compactUsdgParts, findPool, MARKETS, NETWORKS } from "@/lib/markets";
import { RISK_PARAMS } from "@/lib/risk-params";

/**
 * One listed collateral pool, addressed the way the URL reads it:
 * /robinhood/blue-chip/<poolId>/eth-usdg.
 *
 * The poolId is the identity and the pair is the readable half; both have to
 * agree with the network and tier or the route 404s, so a link can never show
 * one pool's parameters under another pool's name.
 */
type RouteParams = { network: string; tier: string; marketId: string; pair: string };

export function generateStaticParams(): RouteParams[] {
  return COLLATERAL_POOLS.map((pool) => ({
    network: pool.network,
    tier: pool.tier,
    marketId: pool.poolId,
    pair: pool.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { network, tier, marketId, pair } = await params;
  const pool = findPool(network, tier, marketId, pair);
  if (!pool) return { title: "Market not found" };
  return {
    title: `${pool.pair} · ${MARKETS.find((market) => market.id === pool.tier)?.name} market`,
    description: `Borrow USDG against a Uniswap v4 ${pool.pair} LP position on ${NETWORKS[pool.network].name}.`,
  };
}

const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

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
}: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  hint: string;
}) {
  return (
    <div>
      <div className="group/hint relative inline-flex items-center gap-1.5">
        <span className="text-[13px] text-steel-400">{label}</span>
        <Info className="size-3.5 shrink-0 text-steel-600" aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-60 rounded-lg border border-border bg-[#292a2c] px-2.5 py-2 text-[11px] leading-[17px] text-steel-300 shadow-xl group-hover/hint:block"
        >
          {hint}
          <span className="mt-1 block text-steel-500">Simulated: the contracts are not deployed yet.</span>
        </span>
      </div>
      <p className="font-display tnum mt-2 text-[30px] font-semibold leading-none text-foreground sm:text-[34px]">
        {value}
        <span className="text-steel-500">{unit}</span>
      </p>
      <p className="tnum mt-2.5 text-[12px] text-steel-500">{sub}</p>
    </div>
  );
}

/**
 * Heads a section drawn from generated history. The label is not decoration:
 * a chart of invented balances without it would read as the pool's record.
 */
function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={id} className="text-[17px] font-semibold text-foreground">
        {children}
      </h2>
      <span title="The contracts are not deployed yet, so this history is generated.">
        <Badge tone="neutral">Simulated</Badge>
      </span>
    </div>
  );
}

export default async function MarketDetailPage({ params }: { params: Promise<RouteParams> }) {
  const { network, tier, marketId, pair } = await params;
  const pool = findPool(network, tier, marketId, pair);
  if (!pool) notFound();

  const market = MARKETS.find((item) => item.id === pool.tier)!;
  const risk = RISK_PARAMS[pool.tier];
  const chain = NETWORKS[pool.network];
  const availableUsd = pool.liquidityUsd - pool.totalBorrowUsd;
  const utilization = (pool.totalBorrowUsd / pool.liquidityUsd) * 100;
  const borrowed = compactUsdgParts(pool.totalBorrowUsd);
  const liquidity = compactUsdgParts(pool.liquidityUsd);

  return (
    <div>
      <Link
        href="/market"
        className="focus-ring inline-flex items-center gap-1.5 rounded text-[13px] text-steel-400 transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All markets
      </Link>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="flex items-center gap-4">
          <AssetPair pair={pool.pair} size={44} hint="Uniswap v4 LP" />
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight text-foreground sm:text-[32px]">
              {pool.pair}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">
            <AssetMark asset={pool.network} size={14} /> {chain.name}
          </Badge>
          <Badge tone={pool.tier === "meme" ? "warn" : "brand"}>{market.name} market</Badge>
          <Badge tone="neutral">{pool.trustedBy}</Badge>
        </div>
      </header>

      {/* Reading column and action rail. Four metrics will not sit on one line
          beside a 356px rail inside max-w-6xl, so they pair up instead of
          wrapping ragged. */}
      <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_356px] lg:gap-12">
        <div className="min-w-0">
          <section aria-label="Market activity" className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
            <Metric
              label="Total Borrow"
              value={borrowed.value}
              unit={borrowed.unit}
              sub={borrowed.inToken}
              hint={`USDG borrowed against ${pool.pair} LP positions held by this pool.`}
            />
            <Metric
              label="Total Liquidity"
              value={liquidity.value}
              unit={liquidity.unit}
              sub={liquidity.inToken}
              hint={`USDG supplied to the ${market.name} market, which this pool borrows from.`}
            />
            <Metric
              label="Borrow APR"
              value={pool.borrowAprPct.toFixed(2)}
              unit="%"
              sub="Paid by borrowers"
              hint="Annualised borrowing cost at the current utilisation, from the kinked rate model."
            />
            <Metric
              label="Supply APY"
              value={market.supplyApy.toFixed(2)}
              unit="%"
              sub="Earned by USDG lenders"
              hint={`Annualised yield for USDG depositors in the ${market.name} market, after the ${market.reserveFactor}% reserve factor.`}
            />
          </section>

          <div className="mt-10">
            <Tabs
              label="Pool details"
              tabs={[
                {
                  id: "pool",
                  label: "Pool",
                  panel: (
                    <>
                      <InfoList className="border-t-0">
                        <InfoRow label="Network">
                          {chain.name} · chain {chain.chainId}
                        </InfoRow>
                        <InfoRow label="Loan asset">USDG</InfoRow>
                        <InfoRow label="Collateral">Uniswap v4 {pool.pair} LP NFT</InfoRow>
                        <InfoRow label="Priced by">{risk.priceSource}</InfoRow>
                        <InfoRow label="Utilization">{utilization.toFixed(1)}%</InfoRow>
                        <InfoRow label="Available to borrow">{fmtUsd(availableUsd)}</InfoRow>
                      </InfoList>
                      <div className="mt-5">
                        <p className="label-xs">Pool ID</p>
                        <p className="mt-2 break-all font-mono text-[12px] leading-[18px] text-steel-300">
                          {pool.poolId}
                        </p>
                      </div>
                    </>
                  ),
                },
                {
                  id: "risk",
                  label: "Risk parameters",
                  panel: (
                    <InfoList className="border-t-0">
                      <InfoRow label="Max LTV at borrow">{pct(risk.maxLtv)}</InfoRow>
                      <InfoRow label="Liquidation threshold">{pct(risk.liqThreshold)}</InfoRow>
                      <InfoRow label="Liquidator bonus">{pct(risk.liquidatorBonus)}</InfoRow>
                      <InfoRow label="Protocol liquidation fee">{risk.protocolLiqFeePct}% of repay</InfoRow>
                      <InfoRow label="Close factor">{risk.closeFactor}</InfoRow>
                      <InfoRow label="Debt cap, this pool">{risk.poolDebtCap}</InfoRow>
                      <InfoRow label="Debt cap, whole market">{fmtUsd(risk.marketDebtCapUsd)}</InfoRow>
                      <InfoRow label="Reserve factor">{risk.reserveFactorPct}% of interest</InfoRow>
                      <InfoRow label="Reserve floor">{risk.reserveFloorPct}% of total assets</InfoRow>
                      <InfoRow label="Interest rate model">
                        kink {risk.irm.kinkPct}% · slope {risk.irm.slope1Pct}% / {risk.irm.slope2Pct}%
                      </InfoRow>
                    </InfoList>
                  ),
                },
              ]}
            />
          </div>

          <div className="mt-12 space-y-12">
            <section aria-labelledby="market-history">
              <SectionHeading id="market-history">Market</SectionHeading>
              <PoolMarketChart pool={pool} />
            </section>

            <section aria-labelledby="rate-history">
              <SectionHeading id="rate-history">Rates</SectionHeading>
              <PoolRates pool={pool} supplyApyPct={market.supplyApy} />
            </section>

            <section aria-labelledby="activity">
              <SectionHeading id="activity">Activity</SectionHeading>
              <PoolActivity pool={pool} />
            </section>
          </div>
        </div>

        <aside aria-label="Supply or borrow" className="lg:sticky lg:top-24 lg:self-start">
          <MarketActionPanel pool={pool} />
        </aside>
      </div>
    </div>
  );
}
