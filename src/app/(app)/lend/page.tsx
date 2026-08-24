import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Lend" };

const markets = [
  {
    name: "Blue-chip · USDG",
    detail:
      "Backed by ETH/USDG and WETH/USDG positions. Chainlink-priced. Reserve factor 15%.",
  },
  {
    name: "Meme · USDG",
    detail:
      "Backed by meme/USDG positions from allowlisted pools. TWAP-priced, isolated risk. Reserve factor 25%.",
  },
] as const;

export default function LendPage() {
  return (
    <div>
      <PageHeader
        title="Lend USDG"
        description="Deposit USDG into an isolated market and earn utilization-based interest paid by borrowers. Each market carries only its own collateral risk."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {markets.map((m) => (
          <Card key={m.name}>
            <CardHeader>
              <CardTitle className="text-base">{m.name}</CardTitle>
              <CardDescription>{m.detail}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Supply APY, utilization, and deposit/withdraw will appear here once the
              FarmentaMarket contracts are live.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
