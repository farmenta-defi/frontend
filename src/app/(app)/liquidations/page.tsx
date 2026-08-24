import type { Metadata } from "next";

import { LumenCard } from "@/components/lumen/card";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Liquidations" };

export default function LiquidationsPage() {
  return (
    <div>
      <PageHeader
        number="04"
        label="LIQUIDATIONS"
        title="Liquidations"
        description="Public liquidation queue: loans with health factor below 1. Repay part of the debt and receive a slice of the position's liquidity plus a bonus (5% blue-chip, 10% meme)."
      />
      <LumenCard title="QUEUE" delay={600}>
        <p>
          The queue is fed by the Farmenta indexer and is open to anyone. A reference
          liquidation bot (Morpho flash loan + Universal Router swap) will be published in
          the keeper repo.
        </p>
      </LumenCard>
    </div>
  );
}
