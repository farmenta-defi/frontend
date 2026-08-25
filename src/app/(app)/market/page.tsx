import type { Metadata } from "next";

import { MarketView } from "@/components/market/market-view";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Market" };

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const defaultAction = tab === "borrow" ? "borrow" : "supply";

  return (
    <div>
      <PageHeader
        title="Markets"
        description="Supply USDG to earn interest, or borrow USDG against your Uniswap v4 LP position NFTs."
      />
      <MarketView defaultAction={defaultAction} />
    </div>
  );
}
