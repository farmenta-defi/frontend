"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowUpRight, Check, ChevronDown, CircleAlert, Clock3, TriangleAlert, Wallet } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useAccount } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AmountInput, InfoList, InfoRow } from "@/components/ui/field";
import { HealthBar, hfLabel } from "@/components/ui/health-bar";
import { Stat } from "@/components/ui/stat";
import {
  fmtUsd,
  fmtUsdExact,
  fmtUsdg,
  MARKETS,
  MOCK_POSITIONS,
  MOCK_USDG_BALANCE,
  type LpPosition,
  type Market,
} from "@/lib/markets";
import { cn } from "@/lib/utils";

export type MarketAction = "supply" | "borrow";
type DemoWalletState = "connected" | "empty" | "disconnected";
type DemoTransactionState = "idle" | "review" | "awaiting" | "pending" | "success" | "failed";

const emptySubscribe = () => () => {};
const useMounted = () => useSyncExternalStore(emptySubscribe, () => true, () => false);
const marketOf = (marketId: string) => MARKETS.find((market) => market.id === marketId) ?? MARKETS[0];
const floor2 = (value: number) => (Math.floor(value * 100) / 100).toFixed(2);

const transactionLabels: Record<DemoTransactionState, string> = {
  idle: "Idle",
  review: "Review",
  awaiting: "Awaiting wallet",
  pending: "Pending",
  success: "Success",
  failed: "Failed",
};

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="label-xs">{children}</p>;
}

function MetricStrip({ market }: { market: Market }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border/70 border-y border-border/70 sm:grid-cols-4 sm:divide-y-0">
      <Stat label="Supply APY" value={`${market.supplyApy}%`} tone="brand" size="sm" className="px-4 py-4 sm:px-5" />
      <Stat label="Borrow APR" value={`${market.borrowApr}%`} size="sm" className="px-4 py-4 sm:px-5" />
      <Stat label="Utilization" value={`${market.utilization}%`} size="sm" className="px-4 py-4 sm:px-5" />
      <Stat label="Available liquidity" value={fmtUsd(market.tvlUsd * (1 - market.utilization / 100))} size="sm" className="px-4 py-4 sm:px-5" />
    </div>
  );
}

function MarketSelector({ selectedId, onSelect }: { selectedId: string; onSelect: (id: Market["id"]) => void }) {
  return (
    <section aria-labelledby="market-selector-title" className="border-y border-border/80">
      <div className="flex flex-wrap items-end justify-between gap-4 py-5">
        <div><SectionLabel>Choose a market</SectionLabel><h2 id="market-selector-title" className="mt-2 text-[19px] font-semibold text-foreground">Isolated USDG markets</h2></div>
        <span className="text-[12px] text-steel-500">Two risk tiers</span>
      </div>
      <div className="grid border-t border-border/70 md:grid-cols-2 md:divide-x md:divide-border/70">
        {MARKETS.map((market) => {
          const selected = selectedId === market.id;
          return (
            <button key={market.id} type="button" aria-pressed={selected} onClick={() => onSelect(market.id)} className={cn("group relative text-left transition-colors focus-ring md:px-5 md:py-5", selected ? "bg-brand-400/[0.055]" : "hover:bg-white/[0.025]")}>
              {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-400" />}
              <div className="flex items-start justify-between gap-5 py-5 md:py-0">
                <div className="min-w-0"><div className="flex items-center gap-2"><span className={cn("text-[15px] font-semibold", selected ? "text-brand-300" : "text-foreground")}>{market.name}</span><Badge tone={market.id === "meme" ? "warn" : "ok"}>{market.id === "meme" ? "Higher risk" : "Core"}</Badge></div><p className="mt-1 text-[12px] text-steel-400">{market.collateral}</p><p className="mt-3 max-w-md text-[12px] leading-[19px] text-steel-500">{market.description}</p></div>
                <ChevronDown className={cn("mt-1 size-4 shrink-0 rotate-[-90deg] text-steel-600 transition-transform", selected && "text-brand-300")} />
              </div>
              <div className="grid grid-cols-3 gap-4 border-t border-border/60 pt-4"><div><p className="label-xs">Supply</p><p className="tnum mt-1 text-[14px] font-semibold text-brand-300">{market.supplyApy}%</p></div><div><p className="label-xs">Borrow</p><p className="tnum mt-1 text-[14px] font-semibold text-foreground">{market.borrowApr}%</p></div><div><p className="label-xs">TVL</p><p className="tnum mt-1 text-[14px] font-semibold text-foreground">{fmtUsd(market.tvlUsd)}</p></div></div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DemoControls({ walletState, transactionState, setWalletState, setTransactionState }: { walletState: DemoWalletState; transactionState: DemoTransactionState; setWalletState: (state: DemoWalletState) => void; setTransactionState: (state: DemoTransactionState) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border/70 pb-4 text-[12px]"><span className="font-medium text-steel-400">Demo controls</span><label className="inline-flex items-center gap-2 text-steel-500">Wallet view<select value={walletState} onChange={(event) => setWalletState(event.target.value as DemoWalletState)} className="focus-ring rounded-md border border-border bg-white/[0.03] px-2 py-1.5 text-foreground"><option value="connected">Connected</option><option value="empty">No positions</option><option value="disconnected">Disconnected</option></select></label><label className="inline-flex items-center gap-2 text-steel-500">Transaction state<select value={transactionState} onChange={(event) => setTransactionState(event.target.value as DemoTransactionState)} className="focus-ring rounded-md border border-border bg-white/[0.03] px-2 py-1.5 text-foreground">{Object.entries(transactionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
  );
}

function PositionPicker({ positions, selected, onSelect }: { positions: LpPosition[]; selected: LpPosition | null; onSelect: (position: LpPosition) => void }) {
  if (!positions.length) return <div className="border-y border-border/70 py-8"><p className="text-[14px] text-foreground">No eligible LP positions found.</p><p className="mt-2 max-w-sm text-[13px] leading-[20px] text-steel-500">Deposit an eligible Uniswap v4 position to make it available as collateral.</p></div>;
  return <div className="divide-y divide-border/70 border-y border-border/70">{positions.map((position) => { const active = selected?.tokenId === position.tokenId; return <button key={position.tokenId} type="button" aria-pressed={active} onClick={() => onSelect(position)} className={cn("block w-full py-4 text-left transition-colors focus-ring", active ? "bg-brand-400/[0.055]" : "hover:bg-white/[0.025]")}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className={cn("text-[14px] font-semibold", active ? "text-brand-300" : "text-foreground")}>{position.pair}</span><span className="font-mono text-[11px] text-steel-500">#{position.tokenId}</span></div><p className="mt-1 text-[12px] text-steel-500">{position.range} range · {position.composition}</p></div><div className="shrink-0 text-right"><p className="tnum text-[15px] font-semibold text-foreground">{fmtUsd(position.valueUsd)}</p><p className={cn("mt-1 text-[11px]", position.inRange ? "text-ok" : "text-warn")}>{position.inRange ? "In range" : "Out of range"}</p></div></div></button>; })}</div>;
}

function TransactionState({ state, action }: { state: DemoTransactionState; action: MarketAction }) {
  if (state === "idle") return null;
  const config = { review: { icon: CircleAlert, tone: "brand", title: "Review before signing", body: `Check the ${action} terms and risk metrics before continuing.` }, awaiting: { icon: Wallet, tone: "warn", title: "Awaiting wallet confirmation", body: "The next step would open your wallet for approval." }, pending: { icon: Clock3, tone: "warn", title: "Transaction pending", body: "Your mock transaction is waiting for network confirmation." }, success: { icon: Check, tone: "ok", title: "Transaction successful", body: "The mock position has been updated. No real transaction was sent." }, failed: { icon: TriangleAlert, tone: "danger", title: "Transaction failed", body: "The mock transaction was rejected. Review the inputs and try again." }, idle: { icon: CircleAlert, tone: "brand", title: "", body: "" } }[state];
  const Icon = config.icon;
  return <div className={cn("flex items-start gap-3 border-l-2 px-4 py-3", config.tone === "danger" ? "border-danger bg-danger/[0.06]" : config.tone === "warn" ? "border-warn bg-warn/[0.06]" : config.tone === "ok" ? "border-ok bg-ok/[0.06]" : "border-brand-400 bg-brand-400/[0.06]")}><Icon className={cn("mt-0.5 size-4 shrink-0", config.tone === "danger" ? "text-danger" : config.tone === "warn" ? "text-warn" : config.tone === "ok" ? "text-ok" : "text-brand-300")} /><div><p className="text-[13px] font-semibold text-foreground">{config.title}</p><p className="mt-1 text-[12px] leading-[19px] text-steel-400">{config.body}</p></div></div>;
}

export function MarketView({ defaultAction }: { defaultAction: MarketAction }) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const mounted = useMounted();
  const [marketId, setMarketId] = useState<Market["id"]>(MARKETS[0].id);
  const [action, setAction] = useState<MarketAction>(defaultAction);
  const [supplyAmount, setSupplyAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("1800");
  const [selectedPosition, setSelectedPosition] = useState<LpPosition | null>(MOCK_POSITIONS[1]);
  const [walletState, setWalletState] = useState<DemoWalletState>("connected");
  const [transactionState, setTransactionState] = useState<DemoTransactionState>("idle");

  const market = marketOf(marketId);
  const walletConnected = walletState === "connected" || (mounted && isConnected && walletState !== "disconnected");
  const positions = walletState === "empty" || walletState === "disconnected" ? [] : MOCK_POSITIONS.filter((position) => position.marketId === market.id);
  const position = positions.find((item) => item.tokenId === selectedPosition?.tokenId) ?? positions[0] ?? null;
  const supplyValue = Number(supplyAmount) || 0;
  const borrowValue = Number(borrowAmount) || 0;
  const supplyTooBig = supplyValue > MOCK_USDG_BALANCE;
  const positionMarket = position ? marketOf(position.marketId) : market;
  const maxBorrow = position ? position.valueUsd * positionMarket.maxLtv : 0;
  const borrowTooBig = borrowValue > maxBorrow;
  const healthFactor = position && borrowValue > 0 ? (position.valueUsd * positionMarket.liqThreshold) / borrowValue : Infinity;
  const liquidationValue = borrowValue > 0 ? borrowValue / positionMarket.liqThreshold : 0;
  const yearlyBorrow = borrowValue * positionMarket.borrowApr / 100;
  const connect = () => openConnectModal?.();

  const submitAction = () => { if (!walletConnected) return connect(); setTransactionState("review"); };

  return (
    <div className="space-y-7">
      <DemoControls walletState={walletState} transactionState={transactionState} setWalletState={setWalletState} setTransactionState={setTransactionState} />
      <div className="flex flex-wrap items-start justify-between gap-5"><div><SectionLabel>Capital allocation</SectionLabel><h2 className="mt-2 text-[21px] font-semibold text-foreground">Choose where your capital works</h2><p className="mt-2 max-w-2xl text-[13px] leading-[21px] text-steel-400">Allocate USDG or borrow against an eligible LP position.</p></div></div>
      <MarketSelector selectedId={market.id} onSelect={(id) => { setMarketId(id); setSelectedPosition(null); setBorrowAmount(""); }} />
      <section aria-labelledby="selected-market-title" className="border-y border-border/80"><div className="flex flex-wrap items-center justify-between gap-4 py-5"><div><SectionLabel>Selected market</SectionLabel><h2 id="selected-market-title" className="mt-2 text-[20px] font-semibold text-foreground">{market.name} <span className="font-normal text-steel-500">· {market.collateral}</span></h2></div><div className="flex items-center gap-2 text-[12px] text-steel-500"><span className="size-1.5 rounded-full bg-ok" /> {market.oracle === "CHAINLINK" ? "Chainlink priced" : "30 min TWAP"}</div></div><MetricStrip market={market} /></section>
      <section aria-labelledby="action-title" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]"><div><div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-4"><div><SectionLabel>Action</SectionLabel><h2 id="action-title" className="mt-2 text-[19px] font-semibold text-foreground">{action === "supply" ? "Supply USDG" : "Borrow against LP"}</h2></div><div role="tablist" aria-label="Market action" className="flex border-b border-border/80"><button type="button" role="tab" aria-selected={action === "supply"} onClick={() => setAction("supply")} className={cn("focus-ring border-b-2 px-3 py-2 text-[13px] font-medium", action === "supply" ? "border-brand-400 text-brand-300" : "border-transparent text-steel-500 hover:text-foreground")}>Supply</button><button type="button" role="tab" aria-selected={action === "borrow"} onClick={() => setAction("borrow")} className={cn("focus-ring border-b-2 px-3 py-2 text-[13px] font-medium", action === "borrow" ? "border-brand-400 text-brand-300" : "border-transparent text-steel-500 hover:text-foreground")}>Borrow</button></div></div>
          {action === "supply" ? <div className="pt-6"><div className="grid gap-6 sm:grid-cols-3"><Stat label="Asset" value="USDG" size="sm" /><Stat label="Wallet balance" value={walletConnected ? fmtUsdg(MOCK_USDG_BALANCE) : "—"} hint="Available USDG" size="sm" /><Stat label="Reserve factor" value={`${market.reserveFactor}%`} hint="Protocol reserve" size="sm" /></div><div className="mt-7 max-w-xl"><label htmlFor="supply-amount" className="label-xs">Amount to supply</label><div className="mt-2"><AmountInput id="supply-amount" value={supplyAmount} onChange={setSupplyAmount} onMax={() => setSupplyAmount(String(MOCK_USDG_BALANCE))} disabled={!walletConnected} invalid={supplyTooBig} /></div><p className="mt-2 text-[12px] text-steel-500">Available: {fmtUsdg(MOCK_USDG_BALANCE)} USDG</p></div><InfoList className="mt-6 max-w-xl"><InfoRow label="Supply APY"><span className="text-brand-300">{market.supplyApy}%</span></InfoRow><InfoRow label="Estimated yearly interest">{supplyTooBig ? <span className="text-danger">Insufficient balance</span> : supplyValue ? `≈ ${fmtUsdg(supplyValue * market.supplyApy / 100)} USDG` : "Enter an amount"}</InfoRow><InfoRow label="Liquidity available">{fmtUsd(market.tvlUsd * (1 - market.utilization / 100))}</InfoRow></InfoList><div className="mt-6 flex flex-wrap items-center gap-4"><Button type="button" onClick={submitAction} disabled={!walletConnected || supplyValue <= 0 || supplyTooBig}>{walletConnected ? "Review supply" : <><Wallet className="size-4" /> Connect wallet</>}</Button>{transactionState !== "idle" && <button type="button" onClick={() => setTransactionState("idle")} className="focus-ring text-[12px] text-steel-500 hover:text-foreground">Reset demo state</button>}</div></div> : <div className="pt-6">{!walletConnected ? <div className="border-y border-border/70 py-8"><p className="text-[14px] text-foreground">Connect a wallet to inspect LP collateral.</p><p className="mt-2 max-w-md text-[13px] leading-[20px] text-steel-500">The demo wallet switcher can also preview this state without connecting a real wallet.</p><Button type="button" onClick={connect} className="mt-5"><Wallet className="size-4" /> Connect wallet</Button></div> : <><div><SectionLabel>Collateral position</SectionLabel><h3 className="mt-2 text-[15px] font-semibold text-foreground">Select an LP position</h3><div className="mt-3"><PositionPicker positions={positions} selected={position} onSelect={(next) => { setSelectedPosition(next); setBorrowAmount(""); setTransactionState("idle"); }} /></div></div>{position && <div className="mt-7"><div className="grid gap-6 sm:grid-cols-3"><Stat label="Position value" value={fmtUsd(position.valueUsd)} size="sm" /><Stat label={`Max borrow · ${Math.round(positionMarket.maxLtv * 100)}% LTV`} value={`${fmtUsdg(maxBorrow)} USDG`} tone="brand" size="sm" /><Stat label="Uncollected fees" value={fmtUsdExact(position.uncollectedFeesUsd)} hint="Included in collateral value" size="sm" /></div><div className="mt-7 max-w-xl"><label htmlFor="borrow-amount" className="label-xs">Amount to borrow</label><div className="mt-2"><AmountInput id="borrow-amount" value={borrowAmount} onChange={setBorrowAmount} onMax={() => setBorrowAmount(floor2(maxBorrow))} invalid={borrowTooBig} /></div><p className="mt-2 text-[12px] text-steel-500">Borrow asset: USDG · APR: {positionMarket.borrowApr}%</p></div></div>}</>}</div>}
        </div><aside aria-label="Transaction summary" className="border-t border-border/80 pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0"><SectionLabel>{action === "supply" ? "Supply summary" : "Borrow summary"}</SectionLabel>{action === "borrow" && position ? <><div className="mt-4 flex items-end justify-between gap-4"><div><p className="text-[12px] text-steel-500">Health factor</p><p className={cn("font-display tnum mt-1 text-[32px] font-semibold", healthFactor >= 1.1 ? "text-ok" : healthFactor >= 1 ? "text-warn" : "text-danger")}>{hfLabel(healthFactor)}</p></div><Badge tone={healthFactor >= 1.1 ? "ok" : healthFactor >= 1 ? "warn" : "danger"}>{healthFactor >= 1.1 ? "Healthy" : healthFactor >= 1 ? "At risk" : "Liquidatable"}</Badge></div><HealthBar hf={healthFactor} className="mt-4" /><InfoList className="mt-5"><InfoRow label="Current collateral">{fmtUsd(position.valueUsd)}</InfoRow><InfoRow label="Current debt">{fmtUsd(borrowValue)}</InfoRow><InfoRow label="Liquidation threshold">{Math.round(positionMarket.liqThreshold * 100)}% value</InfoRow><InfoRow label="Liquidation at">{borrowValue ? fmtUsd(liquidationValue) : "—"}</InfoRow><InfoRow label="Annual interest">{borrowValue ? `${fmtUsdg(yearlyBorrow)} USDG` : "—"}</InfoRow></InfoList>{!position.inRange && <div className="mt-5 flex gap-2 border-l-2 border-warn bg-warn/[0.06] px-3 py-3 text-[12px] leading-[19px] text-warn"><TriangleAlert className="mt-0.5 size-4 shrink-0" />Position is out of range; collateral value may move faster.</div>}</> : <><p className="mt-4 text-[13px] leading-[21px] text-steel-500">Supply amount and projected interest will appear here.</p><div className="mt-6 border-y border-border/70 py-5"><Stat label="Selected market" value={market.name} size="sm" /><div className="mt-5 grid grid-cols-2 gap-5"><Stat label="APY" value={`${market.supplyApy}%`} tone="brand" size="sm" /><Stat label="Utilization" value={`${market.utilization}%`} size="sm" /></div></div></>}</aside></section>
      {transactionState !== "idle" && <TransactionState state={transactionState} action={action} />}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/70 pt-5 text-[12px] text-steel-500"><a href="https://github.com/farmenta-defi/docs/blob/main/ARCHITECTURE.md" target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1 rounded text-brand-300 hover:underline">Read risk framework <ArrowUpRight className="size-3.5" /></a></div>
    </div>
  );
}
