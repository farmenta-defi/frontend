import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { RISK_PARAMS } from "@/lib/risk-params";

export const metadata: Metadata = { title: "Risk parameters" };

const bc = RISK_PARAMS["blue-chip"];
const meme = RISK_PARAMS.meme;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const irm = (p: typeof bc) =>
  `${p.irm.kinkPct}% / ${p.irm.slope1Pct}% / ${p.irm.slope2Pct}%`;

const rows: readonly (readonly [string, string, string])[] = [
  ["Max LTV at borrow", pct(bc.maxLtv), pct(meme.maxLtv)],
  ["Liquidation threshold", pct(bc.liqThreshold), pct(meme.liqThreshold)],
  ["Liquidator bonus (net)", pct(bc.liquidatorBonus), pct(meme.liquidatorBonus)],
  [
    "Protocol liquidation fee",
    `${bc.protocolLiqFeePct}% of repay`,
    `${meme.protocolLiqFeePct}% of repay`,
  ],
  ["Close factor", bc.closeFactor, meme.closeFactor],
  ["Debt cap per pool", bc.poolDebtCap, meme.poolDebtCap],
  [
    "Market debt cap (initial)",
    usd(bc.marketDebtCapUsd),
    usd(meme.marketDebtCapUsd),
  ],
  [
    "Minimum debt / position value",
    `${usd(bc.minDebtUsd)} / ${usd(bc.minPositionUsd)}`,
    `${usd(meme.minDebtUsd)} / ${usd(meme.minPositionUsd)}`,
  ],
  ["Spot price rule at borrow", bc.spotRuleAtBorrow, meme.spotRuleAtBorrow],
  [
    "Uncollected fees counted for borrow",
    `≤ ${bc.feeCapPctOfPrincipal}% of principal`,
    `≤ ${meme.feeCapPctOfPrincipal}% of principal`,
  ],
  ["Price source", bc.priceSource, meme.priceSource],
  ["Reserve factor", `${bc.reserveFactorPct}%`, `${meme.reserveFactorPct}%`],
  ["Interest model (kink / slope1 / slope2)", irm(bc), irm(meme)],
] as const;

export default function RiskPage() {
  return (
    <div>
      <PageHeader
        title="Risk parameters"
        description="Initial parameters per isolated market, as specified in the Farmenta architecture (v0.3). Subject to simulation before real TVL. Health factor = position value × liquidation threshold ÷ debt."
      />
      <div
        className="overflow-x-auto border border-white/15 anim-fade-up"
        style={{ animationDelay: "600ms" }}
      >
        <table className="w-full font-manrope text-[13px] leading-[18px]">
          <thead>
            <tr className="border-b border-white/15 text-left">
              <th className="px-[20px] py-[12px] font-normal text-[#AFDDFF]/80">
                PARAMETER
              </th>
              <th className="px-[20px] py-[12px] font-normal text-[#AFDDFF]/80 whitespace-nowrap">
                [ BLUE_CHIP_USDG ]
              </th>
              <th className="px-[20px] py-[12px] font-normal text-[#AFDDFF]/80 whitespace-nowrap">
                [ MEME_USDG ]
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([p, bcVal, memeVal]) => (
              <tr key={p} className="border-b border-white/[0.07] last:border-b-0">
                <td className="px-[20px] py-[12px] text-white">{p}</td>
                <td className="px-[20px] py-[12px] text-white/50">{bcVal}</td>
                <td className="px-[20px] py-[12px] text-white/50">{memeVal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="font-manrope mt-4 text-[11px] leading-[14px] text-white/40 anim-fade-up"
        style={{ animationDelay: "750ms" }}
      >
        FULL SPECIFICATION:{" "}
        <a
          className="text-[#AFDDFF] hover:underline"
          href="https://github.com/farmenta-defi/docs/blob/main/ARCHITECTURE.md"
          target="_blank"
          rel="noreferrer"
        >
          VIEW_ARCHITECTURE_DOC
        </a>
      </p>
    </div>
  );
}
