import type { Metadata } from "next";

import { MarketDirectory } from "@/components/app/market-directory";
import { PageHeader } from "@/components/site/page-header";

export const metadata: Metadata = { title: "Markets" };

export default function MarketPage() {
  return (
    <div>
      <PageHeader title="Markets" description="Browse isolated USDG markets and choose a collateral pool." />
      <MarketDirectory />
    </div>
  );
}
