import type { Metadata } from "next";

import { LumenCard } from "@/components/lumen/card";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Lend" };

const markets = [
  {
    title: "BLUE_CHIP_USDG",
    detail:
      "Backed by ETH/USDG and WETH/USDG positions. Chainlink-priced. Reserve factor 15%.",
    delay: 600,
  },
  {
    title: "MEME_USDG",
    detail:
      "Backed by meme/USDG positions from allowlisted pools. TWAP-priced, isolated risk. Reserve factor 25%.",
    delay: 750,
  },
] as const;

export default function LendPage() {
  return (
    <div>
      <PageHeader
        number="01"
        label="LEND"
        title="Lend USDG"
        description="Deposit USDG into an isolated market and earn utilization-based interest paid by borrowers. Each market carries only its own collateral risk."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {markets.map((m) => (
          <LumenCard key={m.title} title={m.title} delay={m.delay}>
            <p className="text-white/70">{m.detail}</p>
            <p className="mt-[10px]">
              Supply APY, utilization, and deposit/withdraw will appear here once the
              FarmentaMarket contracts are live.
            </p>
          </LumenCard>
        ))}
      </div>
    </div>
  );
}
