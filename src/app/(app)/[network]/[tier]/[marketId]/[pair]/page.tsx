import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssetMark, AssetPair } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { InfoList, InfoRow } from "@/components/ui/field";
import { Stat } from "@/components/ui/stat";
import {
  COLLATERAL_POOLS,
  fmtCompactUsdg,
  fmtUsd,
  findPool,
  MARKETS,
  NETWORKS,
} from "@/lib/markets";
import { RISK_PARAMS, SPEC_VERSION } from "@/lib/risk-params";

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

export default async function MarketDetailPage({ params }: { params: Promise<RouteParams> }) {
  const { network, tier, marketId, pair } = await params;
  const pool = findPool(network, tier, marketId, pair);
  if (!pool) notFound();

  const market = MARKETS.find((item) => item.id === pool.tier)!;
  const risk = RISK_PARAMS[pool.tier];
  const chain = NETWORKS[pool.network];
  const availableUsd = pool.liquidityUsd - pool.totalBorrowUsd;
  const utilization = (pool.totalBorrowUsd / pool.liquidityUsd) * 100;

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
            <p className="mt-1.5 text-[13px] text-steel-400">
              Borrow USDG against a Uniswap v4 {pool.pair} LP position
            </p>
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

      <section
        aria-label="Market activity"
        className="mt-8 grid grid-cols-2 divide-x divide-y divide-border/70 border-y border-border/70 sm:grid-cols-4 sm:divide-y-0"
      >
        <Stat label="Total borrow" value={fmtCompactUsdg(pool.totalBorrowUsd)} size="sm" className="px-4 py-4 sm:px-5" />
        <Stat label="Total liquidity" value={fmtCompactUsdg(pool.liquidityUsd)} size="sm" className="px-4 py-4 sm:px-5" />
        <Stat label="Borrow APR" value={`${pool.borrowAprPct.toFixed(2)}%`} size="sm" className="px-4 py-4 sm:px-5" />
        <Stat label="Supply APY" value={`${market.supplyApy}%`} tone="brand" size="sm" className="px-4 py-4 sm:px-5" />
      </section>
      <p className="mt-3 text-[12px] text-steel-500">
        Activity figures are simulated. The FarmentaMarket contracts are not deployed yet, so no
        number on this page describes a real position.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="pool-identity">
          <h2 id="pool-identity" className="text-[17px] font-semibold text-foreground">
            Pool
          </h2>
          <InfoList className="mt-4">
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
          <p className="mt-5 text-[13px] leading-[21px] text-steel-400">
            Lenders here supply into the shared <strong className="font-medium text-foreground">{market.name}</strong>{" "}
            market, not into this pool alone. Bad debt is absorbed by reserves first, and anything
            left over is shared by every USDG depositor in that market.
          </p>
        </section>

        <section aria-labelledby="risk-parameters">
          <h2 id="risk-parameters" className="text-[17px] font-semibold text-foreground">
            Risk parameters
          </h2>
          <p className="mt-1.5 text-[12px] text-steel-500">
            Tier presets from ARCHITECTURE.md {SPEC_VERSION} §6.2. A listed pool may only deviate
            from these in the stricter direction.
          </p>
          <InfoList className="mt-4">
            <InfoRow label="Max LTV at borrow">{pct(risk.maxLtv)}</InfoRow>
            <InfoRow label="Liquidation threshold">{pct(risk.liqThreshold)}</InfoRow>
            <InfoRow label="Liquidator bonus">{pct(risk.liquidatorBonus)}</InfoRow>
            <InfoRow label="Protocol liquidation fee">{risk.protocolLiqFeePct}% of repay</InfoRow>
            <InfoRow label="Close factor">{risk.closeFactor}</InfoRow>
            <InfoRow label="Debt cap, this pool">{risk.poolDebtCap}</InfoRow>
            <InfoRow label="Debt cap, whole market">{fmtUsd(risk.marketDebtCapUsd)}</InfoRow>
            <InfoRow label="Minimum debt">{fmtUsd(risk.minDebtUsd)}</InfoRow>
            <InfoRow label="Minimum position">{fmtUsd(risk.minPositionUsd)}</InfoRow>
            <InfoRow label="Spot rule at borrow">{risk.spotRuleAtBorrow}</InfoRow>
            <InfoRow label="Uncollected fees counted">
              max {risk.feeCapPctOfPrincipal}% of principal
            </InfoRow>
            <InfoRow label="Reserve factor">{risk.reserveFactorPct}% of interest</InfoRow>
            <InfoRow label="Reserve floor">{risk.reserveFloorPct}% of total assets</InfoRow>
            <InfoRow label="Interest rate model">
              kink {risk.irm.kinkPct}% · slope {risk.irm.slope1Pct}% / {risk.irm.slope2Pct}%
            </InfoRow>
          </InfoList>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border/70 pt-5 text-[12px] text-steel-500">
        <Link href="/risk" className="focus-ring rounded text-brand-300 hover:underline">
          How liquidation works
        </Link>
        <a
          href="https://github.com/farmenta-defi/docs/blob/main/ARCHITECTURE.md"
          target="_blank"
          rel="noreferrer"
          className="focus-ring inline-flex items-center gap-1 rounded text-brand-300 hover:underline"
        >
          Read the spec <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
