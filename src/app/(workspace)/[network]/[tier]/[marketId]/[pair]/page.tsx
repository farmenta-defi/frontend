import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketActionPanel } from "@/components/app/market-action-panel";
import { PoolActivity } from "@/components/app/pool-activity";
import { PoolFacts, PoolHeadline, PoolRiskTerms } from "@/components/app/pool-figures";
import { PoolMarketChart } from "@/components/app/pool-market-chart";
import { PoolRates } from "@/components/app/pool-rates";
import { AssetMark, AssetPair } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { closureOf, COLLATERAL_POOLS, findPool, MARKETS, NETWORKS } from "@/lib/markets";

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

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-4 text-[17px] font-semibold text-foreground">
      {children}
    </h2>
  );
}

export default async function MarketDetailPage({ params }: { params: Promise<RouteParams> }) {
  const { network, tier, marketId, pair } = await params;
  const pool = findPool(network, tier, marketId, pair);
  if (!pool) notFound();

  const market = MARKETS.find((item) => item.id === pool.tier)!;
  const chain = NETWORKS[pool.network];
  const closure = closureOf(pool.tier);

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
          {/* A market the app holds closed is reachable by its address even though the directory
              does not open it, so its pools' pages carry the label too. */}
          {closure && <Badge tone="neutral">{closure.label}</Badge>}
        </div>
      </header>

      {/* Reading column and action rail. Four metrics will not sit on one line
          beside a 356px rail inside max-w-6xl, so they pair up instead of
          wrapping ragged. */}
      <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_356px] lg:gap-12">
        <div className="min-w-0">
          <PoolHeadline pool={pool} />

          <div className="mt-10">
            <Tabs
              label="Pool details"
              tabs={[
                { id: "pool", label: "Pool", panel: <PoolFacts pool={pool} /> },
                { id: "risk", label: "Risk parameters", panel: <PoolRiskTerms pool={pool} /> },
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
              <PoolRates pool={pool} />
            </section>

            <section aria-labelledby="activity">
              <SectionHeading id="activity">Activity</SectionHeading>
              <PoolActivity pool={pool} />
            </section>
          </div>
        </div>

        <aside
          aria-label="Supply or borrow"
          // Kept in view beside the page. Where it is taller than the window it scrolls by itself:
          // held in place and cut off, its last buttons would only show at the end of the page.
          className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto"
        >
          <MarketActionPanel pool={pool} />
        </aside>
      </div>
    </div>
  );
}
