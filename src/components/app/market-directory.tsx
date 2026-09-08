"use client";

import { ArrowUpRight, Maximize2, Minimize2, Search, Settings2, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AssetMark, AssetPair } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  COLLATERAL_POOLS,
  fmtCompactUsdg,
  MARKETS,
  poolHref,
  type CollateralPool,
} from "@/lib/markets";
import { RISK_PARAMS } from "@/lib/risk-params";
import { cn } from "@/lib/utils";

type FilterMenu = "network" | "loan" | "collateral" | "advanced" | null;
type FilterRanges = { marketMin: string; marketMax: string; liquidityMin: string; liquidityMax: string; rateMin: string; rateMax: string; lltvMin: number; lltvMax: number };

/**
 * The percentage the LLTV column shows. It is the borrow-time max LTV, not the
 * liquidation threshold — see the note on the column header in this file.
 */
const ltvPct = (pool: CollateralPool) => RISK_PARAMS[pool.tier].maxLtv * 100;

/** The advanced sheet's numeric ranges, all built the same way. */
const RANGE_ROWS = [
  ["Total market size", "marketMin", "marketMax", "$"],
  ["Total liquidity", "liquidityMin", "liquidityMax", "$"],
  ["6H rate", "rateMin", "rateMax", "%"],
] as const;

function FilterPanel({ menu, onClose, setNetwork, setLoan, setCollateral, ranges, setRanges, reset }: {
  menu: Exclude<FilterMenu, null>;
  onClose: () => void;
  setNetwork: (value: "robinhood") => void;
  setLoan: (value: "USDG") => void;
  setCollateral: (value: "all" | "blue-chip" | "meme") => void;
  ranges: FilterRanges;
  setRanges: (value: FilterRanges) => void;
  reset: () => void;
}) {
  if (menu === "advanced") {
    return (
      <div className="absolute left-0 top-10 z-30 flex max-h-[min(70vh,540px)] w-[min(100vw-2rem,372px)] flex-col overflow-hidden rounded-2xl border border-border bg-[#292a2c] shadow-2xl sm:left-auto sm:right-0">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Label and control share a row here; the other sections stack. */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] font-medium text-foreground">Trusted by</p>
            <button type="button" className="focus-ring flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-foreground hover:bg-white/[0.07]">
              <SlidersHorizontal className="size-3.5 text-steel-400" /> All
            </button>
          </div>

          {RANGE_ROWS.map(([label, minKey, maxKey, suffix]) => (
            <div key={label}>
              <p className="text-[13px] font-medium text-foreground">{label}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([minKey, maxKey] as const).map((key) => (
                  <label key={key} className="flex items-center rounded-lg bg-white/[0.1] px-2.5">
                    <span className="sr-only">{label} {key.includes("Min") ? "minimum" : "maximum"}</span>
                    <input
                      value={ranges[key]}
                      onChange={(event) => setRanges({ ...ranges, [key]: event.target.value })}
                      placeholder={key.includes("Min") ? "Min" : "Max"}
                      className="h-9 w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-steel-400"
                    />
                    <span className="text-[13px] text-steel-300">{suffix}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div>
            <p className="text-[13px] font-medium text-foreground">LLTV</p>
            <div className="relative mt-4 h-1.5 rounded-full bg-brand-500">
              {(["lltvMin", "lltvMax"] as const).map((key) => (
                <input
                  key={key}
                  type="range"
                  min="30"
                  max="100"
                  aria-label={key === "lltvMin" ? "LLTV minimum" : "LLTV maximum"}
                  value={ranges[key]}
                  onChange={(event) => setRanges({ ...ranges, [key]: Number(event.target.value) })}
                  className="range-thumb pointer-events-auto absolute inset-0 h-1.5 w-full appearance-none bg-transparent"
                />
              ))}
            </div>
            <div className="mt-2.5 flex justify-between text-[10px] text-steel-400">
              {["30%", "50%", "65%", "80%", "100%"].map((tick) => <span key={tick}>{tick}</span>)}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 border-t border-border px-3 py-2">
          <button type="button" onClick={reset} className="focus-ring rounded-lg bg-danger/[0.08] px-3 py-1.5 text-[12.5px] text-danger hover:bg-danger/[0.15]">Reset</button>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg px-3 py-1.5 text-[12.5px] text-steel-300 hover:bg-white/[0.06]">Done</button>
        </div>
      </div>
    );
  }

  const options: readonly [string, string, boolean][] = menu === "network"
    ? [["robinhood", "Robinhood", true], ["arbitrum", "Arbitrum", false]]
    : menu === "loan"
      ? [["USDG", "USDG", true], ["USDC", "USDC", false], ["USDT", "USDT", false]]
      : [["all", "All collateral", true], ["blue-chip", "Blue chip", true], ["meme", "Meme", true]];

  return (
    <div className="absolute left-0 top-10 z-30 min-w-52 overflow-hidden rounded-xl border border-border bg-[#292a2c] p-1.5 shadow-2xl">
      {options.map(([value, label, enabled]) => (
        <button
          key={value}
          type="button"
          disabled={!enabled}
          onClick={() => {
            if (menu === "network" && value === "robinhood") setNetwork("robinhood");
            if (menu === "loan" && value === "USDG") setLoan("USDG");
            if (menu === "collateral") setCollateral(value as "all" | "blue-chip" | "meme");
            if (enabled) onClose();
          }}
          className="flex w-full items-center justify-between gap-4 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:text-steel-600"
        >
          <span className="flex items-center gap-2">
            {menu === "network"
              ? <AssetMark asset={value as "robinhood" | "arbitrum"} size={18} />
              : menu === "loan"
                ? <AssetMark asset={value as "USDG" | "USDC" | "USDT"} size={18} />
                : null}
            {label}
          </span>
          {!enabled && <span className="text-[10px] uppercase tracking-wide text-steel-600">Coming soon</span>}
        </button>
      ))}
    </div>
  );
}

export function MarketDirectory() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openMenu, setOpenMenu] = useState<FilterMenu>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  // Read inside the expand handler below, which must not re-subscribe when a
  // menu opens: it saves the body's overflow, and re-running would save its
  // own value back.
  const openMenuRef = useRef<FilterMenu>(null);
  const [expanded, setExpanded] = useState(false);
  const [network, setNetwork] = useState<"robinhood">("robinhood");
  const [loan, setLoan] = useState<"USDG">("USDG");
  const [collateral, setCollateral] = useState<"all" | "blue-chip" | "meme">("all");
  const [ranges, setRanges] = useState<FilterRanges>({ marketMin: "", marketMax: "", liquidityMin: "", liquidityMax: "", rateMin: "", rateMax: "", lltvMin: 30, lltvMax: 100 });
  const filteredRows = useMemo(() => COLLATERAL_POOLS.filter((pool) => {
    const matchesQuery = `${pool.pair} ${pool.tier} ${pool.trustedBy}`.toLowerCase().includes(query.toLowerCase());
    const matchesCollateral = collateral === "all" || pool.tier === collateral;
    const matchesMarketMin = !ranges.marketMin || pool.marketSizeUsd >= Number(ranges.marketMin);
    const matchesMarketMax = !ranges.marketMax || pool.marketSizeUsd <= Number(ranges.marketMax);
    const matchesLiquidityMin = !ranges.liquidityMin || pool.liquidityUsd >= Number(ranges.liquidityMin);
    const matchesLiquidityMax = !ranges.liquidityMax || pool.liquidityUsd <= Number(ranges.liquidityMax);
    const matchesRateMin = !ranges.rateMin || pool.rate6hPct >= Number(ranges.rateMin);
    const matchesRateMax = !ranges.rateMax || pool.rate6hPct <= Number(ranges.rateMax);
    const lltv = ltvPct(pool);
    return matchesQuery && matchesCollateral && pool.network === network && loan === "USDG" && matchesMarketMin && matchesMarketMax && matchesLiquidityMin && matchesLiquidityMax && matchesRateMin && matchesRateMax && lltv >= ranges.lltvMin && lltv <= ranges.lltvMax;
  }), [collateral, loan, network, query, ranges]);

  const resetFilters = () => {
    setQuery("");
    setNetwork("robinhood");
    setLoan("USDG");
    setCollateral("all");
    setRanges({ marketMin: "", marketMax: "", liquidityMin: "", liquidityMax: "", rateMin: "", rateMax: "", lltvMin: 30, lltvMax: 100 });
  };

  useEffect(() => {
    openMenuRef.current = openMenu;
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!filtersRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !openMenuRef.current) setExpanded(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  return (
    <div className={cn("border border-border bg-[#0b0c0e] shadow-[0_20px_60px_rgba(0,0,0,0.18)]", expanded ? "fixed inset-0 z-[100] overflow-auto rounded-none" : "rounded-[22px]")}>
      <div className="relative flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <div ref={filtersRef} className="flex flex-wrap items-center gap-1">
          {(["network", "loan", "collateral", "advanced"] as const).map((menu) => <div key={menu} className="relative"><button type="button" onClick={() => setOpenMenu((current) => current === menu ? null : menu)} className={cn(buttonClasses({ variant: "ghost", size: "sm" }), "h-8 gap-1.5 px-2.5 text-[12.5px]", openMenu === menu && "bg-white/[0.07] text-foreground")}>{menu === "network" ? <AssetMark asset={network} size={16} /> : menu === "loan" ? <AssetMark asset={loan} size={16} /> : <SlidersHorizontal className="size-3.5" />}{menu === "network" ? network === "robinhood" ? "Robinhood" : network : menu === "loan" ? loan : menu === "collateral" ? collateral === "all" ? "Collateral" : collateral === "blue-chip" ? "Blue chip" : "Meme" : "Advanced"}</button>{openMenu === menu && <FilterPanel menu={menu} onClose={() => setOpenMenu(null)} setNetwork={setNetwork} setLoan={setLoan} setCollateral={setCollateral} ranges={ranges} setRanges={setRanges} reset={resetFilters} />}</div>)}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="relative hidden sm:block"><span className="sr-only">Filter markets</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter markets" className="focus-ring h-9 w-44 rounded-full border border-transparent bg-white/[0.1] pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-steel-500 focus:border-brand-400/50" /></label>
          <button type="button" aria-label="Market settings" className="focus-ring rounded-lg p-2 text-steel-400 transition-colors hover:bg-white/[0.06] hover:text-foreground"><Settings2 className="size-4" /></button>
          <button type="button" aria-label={expanded ? "Exit expanded market table" : "Expand market table"} onClick={() => setExpanded((value) => !value)} className="focus-ring rounded-lg p-2 text-steel-400 transition-colors hover:bg-white/[0.06] hover:text-foreground">{expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>
        </div>
        <label className="relative block w-full sm:hidden"><span className="sr-only">Filter markets</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter markets" className="focus-ring h-10 w-full rounded-lg border border-border bg-white/[0.04] pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-steel-500 focus:border-brand-400/50" /></label>
      </div>

      <div className={cn(!expanded && "overflow-hidden rounded-b-[22px]")}>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1020px] border-collapse text-left">
          <thead><tr className="border-b border-border bg-white/[0.015] text-steel-400"><th className="px-6 py-4 text-[13px] font-medium">Network</th><th className="px-5 py-4 text-[13px] font-medium">Loan</th><th className="px-5 py-4 text-[13px] font-medium">Collateral</th><th className="px-5 py-4 text-right text-[13px] font-medium">LLTV</th><th className="px-5 py-4 text-[13px] font-medium">Trusted by</th><th className="px-5 py-4 text-right text-[13px] font-medium">Total borrow <span className="ml-1 text-steel-500">↓</span></th><th className="px-5 py-4 text-right text-[13px] font-medium">Total liquidity</th><th className="px-6 py-4 text-right text-[13px] font-medium">Borrow APR</th></tr></thead>
          <tbody>{filteredRows.map((pool) => { const market = MARKETS.find((item) => item.id === pool.tier)!; const href = poolHref(pool); return <tr key={pool.poolId} onClick={() => router.push(href)} className="group cursor-pointer border-b border-border/70 text-[14px] transition-colors last:border-b-0 hover:bg-white/[0.035]"><td className="px-6 py-5"><AssetMark asset={pool.network} label /></td><td className="px-5 py-5"><span className="flex items-center gap-2"><AssetMark asset="USDG" size={20} /><span className="font-semibold text-foreground">USDG</span></span></td><td className="px-5 py-5"><div className="flex items-center gap-2.5"><AssetPair pair={pool.pair} size={24} hint="Uniswap v4 LP" /><div>{/* A real link inside the row, so the pool opens with the keyboard or a middle click too. */}<Link href={href} onClick={(event) => event.stopPropagation()} className="focus-ring rounded font-semibold text-foreground">{pool.pair}</Link><div className="mt-0.5 text-[12px] text-steel-500">{market.name} market</div></div></div></td><td className="tnum px-5 py-5 text-right font-medium text-foreground">{ltvPct(pool).toFixed(2)}%</td><td className="px-5 py-5"><Badge tone={pool.tier === "meme" ? "warn" : "neutral"}>{pool.trustedBy}</Badge></td><td className="tnum px-5 py-5 text-right text-foreground"><div>{fmtCompactUsdg(pool.totalBorrowUsd)}</div><div className="mt-1 text-[11px] text-steel-500">simulated</div></td><td className="tnum px-5 py-5 text-right text-foreground"><div>{fmtCompactUsdg(pool.liquidityUsd)}</div><div className="mt-1 text-[11px] text-steel-500">available market</div></td><td className="tnum px-6 py-5 text-right font-medium text-foreground"><div>{pool.borrowAprPct.toFixed(2)}%</div><span className="mt-2 inline-flex items-center gap-1 text-[11px] text-brand-300 opacity-0 transition-opacity group-hover:opacity-100">Open <ArrowUpRight className="size-3" /></span></td></tr>; })}</tbody>
        </table>
      </div>

      <div className="divide-y divide-border/70 md:hidden">{filteredRows.map((pool) => { const market = MARKETS.find((item) => item.id === pool.tier)!; return <Link key={pool.poolId} href={poolHref(pool)} className="block px-4 py-5 transition-colors hover:bg-white/[0.035] focus-ring"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><AssetPair pair={pool.pair} size={20} /><h3 className="text-[15px] font-semibold text-foreground">{pool.pair}</h3></div><p className="mt-1 flex items-center gap-1.5 text-[12px] text-steel-500"><AssetMark asset="USDG" size={14} />USDG · {market.name} · {pool.trustedBy}</p></div><ArrowUpRight className="size-4 text-steel-500" /></div><div className="mt-5 grid grid-cols-3 gap-4"><div><p className="label-xs">LLTV</p><p className="tnum mt-1 text-[13px] text-foreground">{ltvPct(pool).toFixed(2)}%</p></div><div><p className="label-xs">Borrow</p><p className="tnum mt-1 text-[13px] text-foreground">{fmtCompactUsdg(pool.totalBorrowUsd)}</p></div><div><p className="label-xs">APR</p><p className="tnum mt-1 text-[13px] text-foreground">{pool.borrowAprPct.toFixed(2)}%</p></div></div></Link>; })}</div>

      {!filteredRows.length && <div className="px-6 py-14 text-center"><p className="text-[14px] text-foreground">No markets match this filter.</p><button type="button" onClick={resetFilters} className="focus-ring mt-3 text-[13px] text-brand-300 hover:underline">Clear filters</button></div>}
      </div>
    </div>
  );
}
