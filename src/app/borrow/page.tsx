import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Borrow" };

export default function BorrowPage() {
  return (
    <div>
      <PageHeader
        title="Borrow against your LP"
        description="Deposit a Uniswap v4 position NFT as collateral and borrow USDG. Your position keeps earning fees; you can claim them while the loan stays healthy."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Use an existing position</CardTitle>
            <CardDescription>
              Your Uniswap v4 position NFTs will be listed here (via the Farmenta indexer —
              the PositionManager has no on-chain enumeration). Deposit with a single
              signature (ERC-721 permit).
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Position list, collateral value, max borrow, and health-factor preview coming
            with the contracts.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create a new position</CardTitle>
            <CardDescription>
              Pick an eligible pool, set a range (symmetric ±20–25% preset), and mint +
              deposit + borrow in one transaction.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Pool picker with policy checks (hook safety bits, caps) coming with the
            contracts.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
