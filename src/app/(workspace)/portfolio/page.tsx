"use client";

import { ArrowRight, ExternalLink, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";

import { PageHeader } from "@/components/site/page-header";
import { Badge, Dot } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HealthBar } from "@/components/ui/health-bar";
import { Stat } from "@/components/ui/stat";
import { WalletButton } from "@/components/site/wallet-button";
import { contracts, positionManagerAbi } from "@/lib/contracts";
import { fmtUsd, fmtUsdExact, MOCK_POSITIONS } from "@/lib/markets";
import { chain } from "@/lib/wagmi";

type PortfolioView = "active" | "empty" | "risk" | "disconnected";

const statusTone = { healthy: "ok", warning: "warn", critical: "danger", liquidatable: "danger" } as const;

export default function PortfolioPage() {
  const { address } = useAccount();
  const { data: posmBalance, isLoading } = useReadContract({ address: contracts.positionManager, abi: positionManagerAbi, functionName: "balanceOf", args: address ? [address] : undefined, chainId: chain.id, query: { enabled: !!address } });
  const [view, setView] = useState<PortfolioView>("active");
  const nftCount = posmBalance === undefined ? null : Number(posmBalance);
  const positions = view === "risk" ? MOCK_POSITIONS.filter((position) => position.status === "liquidatable") : view === "empty" ? [] : MOCK_POSITIONS;
  const totalValue = positions.reduce((sum, position) => sum + position.valueUsd, 0);
  const borrowed = positions.reduce((sum, position) => sum + position.borrowedUsd, 0);
  const healthFactor = borrowed ? Math.min(...positions.filter((position) => position.borrowedUsd).map((position) => position.healthFactor)) : Infinity;

  return (
    <div>
      <PageHeader title="Portfolio" description="Manage LP positions, USDG supply, collateral, and borrowing risk from one account view." actions={<div className="flex items-center gap-3"><Badge tone="neutral">Mock portfolio</Badge><Link href="/market?tab=borrow" className={buttonClasses({ variant: "primary", size: "sm" })}>Open market <ArrowRight className="size-4" /></Link></div>} />

      <div className="mb-7 flex flex-wrap items-center gap-3 border-b border-border/70 pb-4 text-[12px]"><span className="font-medium text-steel-400">Demo view</span>{([['active', 'Active loan'], ['empty', 'No positions'], ['risk', 'Critical risk'], ['disconnected', 'Disconnected']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setView(value)} className={value === view ? "focus-ring border-b-2 border-brand-400 px-2 py-2 text-brand-300" : "focus-ring px-2 py-2 text-steel-500 hover:text-foreground"}>{label}</button>)}</div>

      {view === "disconnected" ? <Card className="border-border/80"><div className="flex flex-col items-start gap-4 px-5 py-10 sm:px-7"><div className="flex items-center gap-3"><Wallet className="size-5 text-brand-300" /><div><h2 className="text-[17px] font-semibold text-foreground">Connect to manage your portfolio</h2><p className="mt-1 max-w-md text-[13px] leading-[21px] text-steel-400">Your positions remain on-chain. Connect a wallet to inspect eligibility, collateral, and loan health.</p></div></div><WalletButton /></div></Card> : <div className="space-y-8">
        <section aria-labelledby="overview-title"><div className="flex items-end justify-between gap-4 border-b border-border/80 pb-4"><div><p className="label-xs">Account overview</p><h2 id="overview-title" className="mt-2 text-[19px] font-semibold text-foreground">Capital at work</h2></div><Badge tone="ok"><Dot tone="ok" /> Simulated data</Badge></div><div className="grid grid-cols-2 divide-x divide-y divide-border/70 border-b border-border/70 sm:grid-cols-4 sm:divide-y-0"><Stat label="Collateral value" value={fmtUsd(totalValue || 47_980)} size="sm" className="px-4 py-5 sm:px-5" /><Stat label="Total supplied" value="$8,420" tone="brand" size="sm" className="px-4 py-5 sm:px-5" /><Stat label="Total borrowed" value={fmtUsd(borrowed || 21_050)} size="sm" className="px-4 py-5 sm:px-5" /><Stat label="Net position" value={fmtUsd((totalValue || 47_980) - (borrowed || 21_050))} size="sm" className="px-4 py-5 sm:px-5" /></div></section>

        <section aria-labelledby="positions-title"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/80 pb-4"><div><p className="label-xs">Active positions</p><h2 id="positions-title" className="mt-2 text-[19px] font-semibold text-foreground">LP collateral and loans</h2></div><div className="text-[12px] text-steel-500">{isLoading || nftCount === null ? "Reading PositionManager…" : `${nftCount} NFT${nftCount === 1 ? "" : "s"} detected on-chain`}</div></div>{positions.length === 0 ? <div className="border-b border-border/70 py-10"><p className="text-[14px] text-foreground">No positions in this view.</p><p className="mt-2 text-[13px] text-steel-500">Choose another demo state or explore the market to deposit an LP position.</p><Link href="/market?tab=borrow" className={`${buttonClasses({ variant: "secondary", size: "sm" })} mt-5`}>Explore collateral <ArrowRight className="size-4" /></Link></div> : <div className="divide-y divide-border/70 border-b border-border/70">{positions.map((position) => <article key={position.tokenId} className="py-5"><div className="grid gap-5 lg:grid-cols-[1.3fr_repeat(4,1fr)_auto] lg:items-center"><div><div className="flex items-center gap-2"><h3 className="text-[15px] font-semibold text-foreground">{position.pair}</h3><span className="font-mono text-[11px] text-steel-500">#{position.tokenId}</span></div><p className="mt-1 text-[12px] text-steel-500">{position.range} · {position.composition}</p></div><Stat label="Value" value={fmtUsd(position.valueUsd)} size="sm" /><Stat label="Borrowed" value={position.borrowedUsd ? fmtUsd(position.borrowedUsd) : "—"} size="sm" /><Stat label="Health factor" value={position.borrowedUsd ? position.healthFactor.toFixed(2) : "—"} tone={position.borrowedUsd ? statusTone[position.status] : "default"} size="sm" /><Stat label="Fees" value={fmtUsdExact(position.uncollectedFeesUsd)} size="sm" /><a href={`${chain.blockExplorers.default.url}/token/${contracts.positionManager}/instance/${position.tokenId}`} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1 text-[12px] text-brand-300 hover:underline">View <ExternalLink className="size-3.5" /></a></div>{position.borrowedUsd > 0 && <div className="mt-5 max-w-xl"><HealthBar hf={position.healthFactor} /><div className="mt-3 flex flex-wrap gap-2 text-[12px] text-steel-500"><Badge tone={statusTone[position.status]}>{position.status === "liquidatable" ? "Liquidatable" : position.status === "warning" ? "Approaching risk" : "Healthy"}</Badge><span>Liquidation threshold {position.marketId === "meme" ? "40%" : "75%"}</span><span>Borrow APR {position.marketId === "meme" ? "14.3%" : "6.1%"}</span></div></div>}</article>)}</div>}</section>

        <section className="grid gap-8 lg:grid-cols-2"><div className="border-t border-border/80 pt-5"><p className="label-xs">Supply positions</p><h2 className="mt-2 text-[17px] font-semibold text-foreground">USDG supplied</h2><div className="mt-5 grid grid-cols-2 gap-6"><Stat label="Supplied" value="$8,420" tone="brand" size="sm" /><Stat label="Interest earned" value="$126.40" size="sm" /></div><p className="mt-5 text-[13px] leading-[21px] text-steel-500">Supply is isolated to the selected market tier. Withdrawals depend on available cash.</p></div><div className="border-t border-border/80 pt-5"><p className="label-xs">Risk posture</p><h2 className="mt-2 text-[17px] font-semibold text-foreground">{Number.isFinite(healthFactor) ? "Monitor the lowest health factor" : "No active debt"}</h2><p className="mt-3 text-[13px] leading-[21px] text-steel-500">{Number.isFinite(healthFactor) ? `Your lowest simulated health factor is ${healthFactor.toFixed(2)}. Keep collateral value above the liquidation threshold.` : "Borrow against an eligible LP position to see health factor and liquidation exposure here."}</p><Link href="/risk" className="focus-ring mt-5 inline-flex items-center gap-1 text-[13px] text-brand-300 hover:underline">Review risk parameters <ArrowRight className="size-3.5" /></Link></div></section>
      </div>}
    </div>
  );
}
