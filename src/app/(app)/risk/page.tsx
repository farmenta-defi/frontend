import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Risk parameters" };

const rows = [
  ["Max LTV at borrow", "65%", "30%"],
  ["Liquidation threshold", "75%", "40%"],
  ["Liquidator bonus (net)", "5%", "10%"],
  ["Protocol liquidation fee", "0.5% of repay", "2% of repay"],
  ["Close factor", "50% (100% if HF < 0.9)", "100%"],
  ["Debt cap per pool", "≤ 10% of pool TVL", "≤ 5% of pool TVL, max $20k"],
  ["Market debt cap (initial)", "$500,000", "$50,000"],
  ["Price source", "Chainlink (Pyth check)", "30-min TWAP, min(spot, TWAP) to borrow"],
  ["Reserve factor", "15%", "25%"],
  ["Interest model (kink / slope1 / slope2)", "80% / 4% / 60%", "70% / 8% / 100%"],
] as const;

export default function RiskPage() {
  return (
    <div>
      <PageHeader
        title="Risk parameters"
        description="Initial parameters per isolated market, as specified in the Farmenta architecture (v0.2). Subject to simulation before real TVL. Health factor = position value × liquidation threshold ÷ debt."
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
            {rows.map(([p, bc, meme]) => (
              <tr key={p} className="border-b border-white/[0.07] last:border-b-0">
                <td className="px-[20px] py-[12px] text-white">{p}</td>
                <td className="px-[20px] py-[12px] text-white/50">{bc}</td>
                <td className="px-[20px] py-[12px] text-white/50">{meme}</td>
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
