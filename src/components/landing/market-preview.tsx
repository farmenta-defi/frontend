import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmtUsd, MARKETS } from "@/lib/markets";
import { RISK_PARAMS } from "@/lib/risk-params";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function MarketPreview() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs">Markets</p>
          <h2 className="font-display mt-3 text-[28px] font-semibold leading-tight text-foreground sm:text-[34px]">
            Two isolated markets, curated pool by pool
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-[24px] text-steel-400">
            A loss in one market cannot reach the other. Every pool is reviewed before it is
            listed. There is no automatic path in, and a listing may only tighten the tier
            preset, never loosen it.
          </p>
        </div>
        <Link href="/market" className={buttonClasses({ variant: "secondary", size: "md" })}>
          Open markets
          <ArrowRight className="size-4" strokeWidth={2} />
        </Link>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4 border-b border-border/80 px-5 py-3.5 sm:px-6">
          <span className="text-[13px] font-medium text-foreground">Market overview</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-border/70">
                {["Market", "Supply APY", "Borrow APR", "Max LTV", "Liq. threshold", "Oracle"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`label-xs px-5 py-3 font-normal ${i > 0 ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {MARKETS.map((m) => (
                <tr key={m.id} className="border-b border-border/50 last:border-b-0">
                  <td className="px-5 py-4">
                    <p className="text-[14px] font-semibold text-foreground">{m.name}</p>
                    <p className="mt-1 text-[12px] text-steel-500">{m.collateral}</p>
                  </td>
                  <td className="font-display tnum px-5 py-4 text-right text-[16px] font-semibold text-brand-300">
                    {m.supplyApy}%
                  </td>
                  <td className="font-display tnum px-5 py-4 text-right text-[16px] font-semibold text-foreground">
                    {m.borrowApr}%
                  </td>
                  <td className="tnum px-5 py-4 text-right text-[13px] text-steel-300">
                    {pct(m.maxLtv)}
                  </td>
                  <td className="tnum px-5 py-4 text-right text-[13px] text-steel-300">
                    {pct(m.liqThreshold)}
                  </td>
                  <td className="px-5 py-4 text-right text-[12px] text-steel-400">{m.oracle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border/70 px-5 py-3.5 text-[12px] text-steel-500 sm:px-6">
          Initial market debt caps: {fmtUsd(RISK_PARAMS["blue-chip"].marketDebtCapUsd)} blue chip,{" "}
          {fmtUsd(RISK_PARAMS.meme.marketDebtCapUsd)} meme.
        </div>
      </Card>
    </section>
  );
}
