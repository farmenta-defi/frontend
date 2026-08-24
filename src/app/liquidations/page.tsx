import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Liquidations" };

export default function LiquidationsPage() {
  return (
    <div>
      <PageHeader
        title="Liquidations"
        description="Public liquidation queue: loans with health factor below 1. Repay part of the debt and receive a slice of the position's liquidity plus a bonus (5% blue-chip, 10% meme)."
      />
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          The queue is fed by the Farmenta indexer and is open to anyone. A reference
          liquidation bot (Morpho flash loan + Universal Router swap) will be published in
          the keeper repo.
        </CardContent>
      </Card>
    </div>
  );
}
