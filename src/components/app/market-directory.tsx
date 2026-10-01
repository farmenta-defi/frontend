"use client";

import { ArrowUpRight, Maximize2, Minimize2, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { FiguresNotice } from "@/components/app/pool-figures";
import { AssetMark, AssetPair } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { directoryRows, inRanges, NO_RANGES, type DirectoryRanges, type DirectoryRow } from "@/lib/backend/directory";
import { knownPools, type ListedPool } from "@/lib/backend/figures";
import { useListedPools, usePoolsFigures } from "@/lib/backend/hooks";
import { fmtCompactUsdg, fmtPct, NO_FIGURE, orDash } from "@/lib/format";
import { closureOf, COLLATERAL_POOLS, MARKETS, poolHref, type CollateralPool } from "@/lib/markets";
import { cn } from "@/lib/utils";

/**
 * The two filters that have something to choose between. Every market here is
 * on Robinhood Chain and lends USDG, so there is no network or loan filter: a
 * menu with one choice in it filters nothing.
 */
type FilterMenu = "collateral" | "advanced" | null;
type Collateral = "all" | "blue-chip" | "meme";
type FilterRanges = DirectoryRanges;
type Row = DirectoryRow<CollateralPool>;

/** The advanced sheet's numeric ranges, all built the same way. */
const RANGE_ROWS = [
  ["Total borrow", "borrowMin", "borrowMax", "USDG"],
  ["Available to borrow", "availableMin", "availableMax", "USDG"],
  ["6H rate", "rateMin", "rateMax", "%"],
] as const;

const COLLATERAL_OPTIONS = [
  ["all", "All collateral"],
  ["blue-chip", "Blue chip"],
  ["meme", "Meme"],
] as const satisfies readonly [Collateral, string][];

const POOL_IDS = COLLATERAL_POOLS.map((pool) => pool.poolId);

/** A pool the backend lists and the app has no page for, said once and not at every refresh. */
const reported = new Set<string>();
const reportOnce = (message: string) => {
  if (reported.has(message)) return;
  reported.add(message);
  console.warn(message);
};

/** A figure in a cell, or the dash. It pulses while the figures are on their way. */
function Cell({ pending, children }: { pending: boolean; children: string }) {
  return <span className={cn(children === NO_FIGURE && "text-steel-500", pending && children === NO_FIGURE && "animate-pulse")}>{children}</span>;
}

function FilterPanel({ menu, onClose, setCollateral, ranges, setRanges, reset }: {
  menu: Exclude<FilterMenu, null>;
  onClose: () => void;
  setCollateral: (value: Collateral) => void;
  ranges: FilterRanges;
  setRanges: (value: FilterRanges) => void;
  reset: () => void;
}) {
  if (menu === "advanced") {
    return (
      <div className="absolute left-0 top-10 z-30 flex max-h-[min(70vh,540px)] w-[min(100vw-4.5rem,372px)] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
                  min="0"
                  max="100"
                  aria-label={key === "lltvMin" ? "LLTV minimum" : "LLTV maximum"}
                  value={ranges[key]}
                  onChange={(event) => setRanges({ ...ranges, [key]: Number(event.target.value) })}
                  className="range-thumb pointer-events-auto absolute inset-0 h-1.5 w-full appearance-none bg-transparent"
                />
              ))}
            </div>
            <div className="mt-2.5 flex justify-between text-[10px] text-steel-400">
              {["0%", "25%", "50%", "75%", "100%"].map((tick) => <span key={tick}>{tick}</span>)}
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

  return (
    <div className="absolute left-0 top-10 z-30 min-w-52 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-2xl">
      {COLLATERAL_OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => {
            setCollateral(value);
            onClose();
          }}
          className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-white/[0.07]"
        >
          {label}
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
  const [collateral, setCollateral] = useState<Collateral>("all");
  const [ranges, setRanges] = useState<FilterRanges>(NO_RANGES);

  // Which pools there are is the app's list; the backend gives each its figures. A pool the
  // backend lists and the app does not know is reported and left out (see `knownPools`).
  const blueChip = useListedPools("blue-chip");
  const meme = useListedPools("meme");
  const figures = usePoolsFigures(POOL_IDS);
  const listed = useMemo<ListedPool[]>(
    () => [...(blueChip.data ?? []), ...(meme.data ?? [])],
    [blueChip.data, meme.data],
  );
  useEffect(() => {
    knownPools(listed, COLLATERAL_POOLS, reportOnce);
  }, [listed]);
  const pending = figures.some((item) => item.status === "loading");
  const rows = useMemo(
    () => directoryRows(COLLATERAL_POOLS, listed, figures.flatMap((item) => (item.data ? [item.data] : []))),
    [listed, figures],
  );

  const filteredRows = useMemo(() => rows.filter((row) => {
    const { pool } = row;
    const matchesQuery = `${pool.pair} ${pool.tier} ${pool.trustedBy}`.toLowerCase().includes(query.toLowerCase());
    const matchesCollateral = collateral === "all" || pool.tier === collateral;
    return matchesQuery && matchesCollateral && inRanges(row, ranges);
  }), [collateral, query, ranges, rows]);

  const resetFilters = () => {
    setQuery("");
    setCollateral("all");
    setRanges(NO_RANGES);
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
    <div className={cn("surface", expanded && "fixed inset-0 z-[100] overflow-auto rounded-none")}>
      <div className="relative flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        {/* Both menus hang from the bar's left edge, where there is room for the wide one at any width. */}
        <div ref={filtersRef} className="relative flex flex-wrap items-center gap-1">
          {(["collateral", "advanced"] as const).map((menu) => (
            <div key={menu}>
              <button type="button" onClick={() => setOpenMenu((current) => current === menu ? null : menu)} className={cn(buttonClasses({ variant: "ghost", size: "sm" }), "h-8 gap-1.5 px-2.5 text-[12.5px]", openMenu === menu && "bg-white/[0.07] text-foreground")}>
                <SlidersHorizontal className="size-3.5" />
                {menu === "advanced" ? "Advanced" : collateral === "all" ? "Collateral" : COLLATERAL_OPTIONS.find(([value]) => value === collateral)![1]}
              </button>
              {openMenu === menu && <FilterPanel menu={menu} onClose={() => setOpenMenu(null)} setCollateral={setCollateral} ranges={ranges} setRanges={setRanges} reset={resetFilters} />}
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="relative hidden sm:block"><span className="sr-only">Filter markets</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter markets" className="focus-ring h-9 w-44 rounded-full border border-transparent bg-white/[0.1] pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-steel-500 focus:border-brand-400/50" /></label>
          <button type="button" aria-label={expanded ? "Exit expanded market table" : "Expand market table"} onClick={() => setExpanded((value) => !value)} className="focus-ring rounded-lg p-2 text-steel-400 transition-colors hover:bg-white/[0.06] hover:text-foreground">{expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>
        </div>
        <label className="relative block w-full sm:hidden"><span className="sr-only">Filter markets</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-steel-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter markets" className="focus-ring h-10 w-full rounded-lg border border-border bg-white/[0.04] pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-steel-500 focus:border-brand-400/50" /></label>
      </div>

      <FiguresNotice figures={[blueChip, meme, ...figures]} className="border-b border-border px-4 py-3 sm:px-6" />

      <div className={cn(!expanded && "overflow-hidden rounded-b-xl")}>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead><tr className="border-b border-border bg-white/[0.015] text-steel-400"><th className="px-6 py-4 text-[13px] font-medium">Loan</th><th className="px-5 py-4 text-[13px] font-medium">Collateral</th><th className="px-5 py-4 text-right text-[13px] font-medium">LLTV</th><th className="px-5 py-4 text-[13px] font-medium">Trusted by</th><th className="px-5 py-4 text-right text-[13px] font-medium">Total borrow</th><th className="px-5 py-4 text-right text-[13px] font-medium">Available to borrow</th><th className="px-6 py-4 text-right text-[13px] font-medium">Borrow APR</th></tr></thead>
          <tbody>
            {filteredRows.map((row: Row) => {
              const { pool } = row;
              const market = MARKETS.find((item) => item.id === pool.tier)!;
              const href = poolHref(pool);
              // A pool of a market the app holds closed is listed and does not open.
              const closure = closureOf(pool.tier);
              return (
                <tr
                  key={pool.poolId}
                  onClick={closure ? undefined : () => router.push(href)}
                  aria-disabled={closure ? true : undefined}
                  className={cn(
                    "group border-b border-border/70 text-[14px] transition-colors last:border-b-0",
                    // Red on hover, and nothing more: the badge already says why the row does not open.
                    closure ? "cursor-not-allowed hover:bg-danger/[0.07]" : "cursor-pointer hover:bg-white/[0.035]",
                  )}
                >
                  <td className="px-6 py-5"><span className="flex items-center gap-2"><AssetMark asset="USDG" size={20} /><span className="font-semibold text-foreground">USDG</span></span></td>
                  <td className="px-5 py-5">
                    <div className="flex items-center gap-2.5">
                      <AssetPair pair={pool.pair} size={24} hint="Uniswap v4 LP" />
                      <div>
                        {closure ? (
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-steel-300 transition-colors group-hover:text-danger">{pool.pair}</span>
                            <Badge tone="neutral" className="transition-colors group-hover:border-danger/40 group-hover:bg-danger/12 group-hover:text-danger">{closure.label}</Badge>
                          </span>
                        ) : (
                          // A real link inside the row, so the pool opens with the keyboard or a middle click too.
                          <Link href={href} onClick={(event) => event.stopPropagation()} className="focus-ring rounded font-semibold text-foreground">{pool.pair}</Link>
                        )}
                        <div className="mt-0.5 text-[12px] text-steel-500">{market.name} market{row.frozen ? " · frozen" : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="tnum px-5 py-5 text-right font-medium text-foreground"><Cell pending={pending}>{orDash(row.maxLtvPct, fmtPct)}</Cell></td>
                  <td className="px-5 py-5"><Badge tone={pool.tier === "meme" ? "warn" : "neutral"}>{pool.trustedBy}</Badge></td>
                  <td className="tnum px-5 py-5 text-right text-foreground"><Cell pending={pending}>{orDash(row.debtUsdg, fmtCompactUsdg)}</Cell></td>
                  <td className="tnum px-5 py-5 text-right text-foreground"><Cell pending={pending}>{orDash(row.availableToBorrowUsdg, fmtCompactUsdg)}</Cell></td>
                  <td className="tnum relative px-6 py-5 text-right font-medium text-foreground">
                    <Cell pending={pending}>{orDash(row.borrowAprPct, fmtPct)}</Cell>
                    {/* Out of the flow, so the figure sits on the same line as the rest of its row. */}
                    {!closure && <span className="pointer-events-none absolute bottom-1 right-6 inline-flex items-center gap-1 text-[11px] text-brand-300 opacity-0 transition-opacity group-hover:opacity-100">Open <ArrowUpRight className="size-3" /></span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border/70 md:hidden">
        {filteredRows.map((row: Row) => {
          const { pool } = row;
          const market = MARKETS.find((item) => item.id === pool.tier)!;
          const closure = closureOf(pool.tier);
          const card = (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2"><AssetPair pair={pool.pair} size={20} /><h3 className={cn("text-[15px] font-semibold", closure ? "text-steel-300" : "text-foreground")}>{pool.pair}</h3></div>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-steel-500"><AssetMark asset="USDG" size={14} />USDG · {market.name} · {pool.trustedBy}</p>
                </div>
                {closure ? <Badge tone="neutral">{closure.label}</Badge> : <ArrowUpRight className="size-4 text-steel-500" />}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-4">
                <div><p className="label-xs">LLTV</p><p className="tnum mt-1 text-[13px] text-foreground"><Cell pending={pending}>{orDash(row.maxLtvPct, fmtPct)}</Cell></p></div>
                <div><p className="label-xs">Borrow</p><p className="tnum mt-1 text-[13px] text-foreground"><Cell pending={pending}>{orDash(row.debtUsdg, fmtCompactUsdg)}</Cell></p></div>
                <div><p className="label-xs">APR</p><p className="tnum mt-1 text-[13px] text-foreground"><Cell pending={pending}>{orDash(row.borrowAprPct, fmtPct)}</Cell></p></div>
              </div>
            </>
          );
          // A closed pool's card carries the badge and is not a link.
          return closure ? (
            <div key={pool.poolId} aria-disabled className="block px-4 py-5">{card}</div>
          ) : (
            <Link key={pool.poolId} href={poolHref(pool)} className="block px-4 py-5 transition-colors hover:bg-white/[0.035] focus-ring">{card}</Link>
          );
        })}
      </div>

      {!filteredRows.length && <div className="px-6 py-14 text-center"><p className="text-[14px] text-foreground">No markets match this filter.</p><button type="button" onClick={resetFilters} className="focus-ring mt-3 text-[13px] text-brand-300 hover:underline">Clear filters</button></div>}
      </div>
    </div>
  );
}
