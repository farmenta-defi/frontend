import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";

import { PageHeader } from "@/components/site/page-header";
import { RiskDisclosures } from "@/components/site/risk-disclosures";
import { Badge } from "@/components/ui/badge";
import { RISK_PARAMS, SPEC_VERSION } from "@/lib/risk-params";

export const metadata: Metadata = { title: "Risk parameters" };

const bc = RISK_PARAMS["blue-chip"];
const meme = RISK_PARAMS.meme;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const usd = (value: number) => `$${value.toLocaleString("en-US")}`;
const irm = (params: typeof bc) => `${params.irm.kinkPct}% / ${params.irm.slope1Pct}% / ${params.irm.slope2Pct}%`;
type Row = readonly [label: string, blueChip: string, meme: string, note?: string];

const ROWS: readonly Row[] = [
  ["Max LTV at borrow", pct(bc.maxLtv), pct(meme.maxLtv)],
  ["Liquidation threshold", pct(bc.liqThreshold), pct(meme.liqThreshold)],
  ["Liquidator bonus", pct(bc.liquidatorBonus), pct(meme.liquidatorBonus)],
  ["Protocol liquidation fee", `${bc.protocolLiqFeePct}% of repay`, `${meme.protocolLiqFeePct}% of repay`, "Derived from bonus ÷ 10"],
  ["Close factor", bc.closeFactor, meme.closeFactor],
  ["Debt cap per pool", bc.poolDebtCap, meme.poolDebtCap],
  ["Market debt cap", usd(bc.marketDebtCapUsd), usd(meme.marketDebtCapUsd)],
  ["Minimum debt / position", `${usd(bc.minDebtUsd)} / ${usd(bc.minPositionUsd)}`, `${usd(meme.minDebtUsd)} / ${usd(meme.minPositionUsd)}`],
  ["Borrow spot rule", bc.spotRuleAtBorrow, meme.spotRuleAtBorrow],
  ["Price source", bc.priceSource, meme.priceSource],
  ["Reserve factor", `${bc.reserveFactorPct}%`, `${meme.reserveFactorPct}%`],
  ["Reserve floor", `${bc.reserveFloorPct}% of assets`, `${meme.reserveFloorPct}% of assets`, "Not withdrawable by owner"],
  ["Interest model · kink / slope 1 / slope 2", irm(bc), irm(meme)],
];

export default function RiskPage() {
  return <div><PageHeader title="Risk framework" description="The parameters that determine how much each isolated market can lend, when a position becomes unsafe, and how liquidation protects suppliers." actions={<Badge tone="brand">Spec {SPEC_VERSION}</Badge>} /><div className="space-y-9"><section aria-labelledby="risk-table-title"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/80 pb-4"><div><p className="label-xs">Market terms</p><h2 id="risk-table-title" className="mt-2 text-[19px] font-semibold text-foreground">Presets and strict bounds</h2></div><p className="max-w-sm text-right text-[12px] leading-[18px] text-steel-500">Listed pools may only tighten these values.</p></div><div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full text-left"><thead><tr className="border-b border-border/70"><th className="label-xs py-3 pr-6 font-normal">Parameter</th><th className="label-xs px-6 py-3 text-right font-normal text-brand-300">Blue chip</th><th className="label-xs py-3 pl-6 text-right font-normal text-warn">Meme</th></tr></thead><tbody>{ROWS.map(([label, blue, memeValue, note]) => <tr key={label} className="border-b border-border/60 last:border-0"><td className="py-4 pr-6"><span className="text-[13px] text-foreground">{label}</span>{note && <span className="ml-2 text-[11px] text-steel-500">{note}</span>}</td><td className="tnum px-6 py-4 text-right text-[13px] text-steel-300">{blue}</td><td className="tnum py-4 pl-6 text-right text-[13px] text-steel-300">{memeValue}</td></tr>)}</tbody></table></div><div className="mt-4 divide-y divide-border/70 border-y border-border/70 md:hidden">{ROWS.map(([label, blue, memeValue, note]) => <div key={label} className="py-4"><div className="flex items-start justify-between gap-4"><div><p className="text-[13px] text-foreground">{label}</p>{note && <p className="mt-1 text-[11px] text-steel-500">{note}</p>}</div><div className="text-right"><p className="tnum text-[13px] text-brand-300">{blue}</p><p className="tnum mt-1 text-[13px] text-warn">{memeValue}</p></div></div></div>)}</div></section><section className="grid gap-8 border-t border-border/80 pt-6 lg:grid-cols-2"><div><p className="label-xs">Listing policy</p><h2 className="mt-2 text-[17px] font-semibold text-foreground">Every pool is curated</h2><p className="mt-3 max-w-xl text-[13px] leading-[21px] text-steel-400">Pool listings are reviewed for token behaviour, hook permissions, age, and depth. There is no automatic path into a market, and each pool carries its own terms.</p></div><div><p className="label-xs">Delisting policy</p><h2 className="mt-2 text-[17px] font-semibold text-foreground">A ramp, not a switch</h2><p className="mt-3 max-w-xl text-[13px] leading-[21px] text-steel-400">New positions stop while existing loans can repay, collect fees, withdraw after repayment, and remain liquidatable. Collateral is never intentionally stranded.</p></div></section><RiskDisclosures /><p className="text-[13px] text-steel-500">Full specification: <a href="https://github.com/farmenta-defi/docs/blob/main/ARCHITECTURE.md" target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1 rounded text-brand-300 hover:underline">ARCHITECTURE.md <ArrowUpRight className="size-3.5" /></a></p></div></div>;
}
