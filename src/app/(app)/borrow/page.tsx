import type { Metadata } from "next";

import { LumenCard } from "@/components/lumen/card";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Borrow" };

export default function BorrowPage() {
  return (
    <div>
      <PageHeader
        number="02"
        label="BORROW"
        title="Borrow against your LP"
        description="Deposit a Uniswap v4 position NFT as collateral and borrow USDG. Your position keeps earning fees; you can claim them while the loan stays healthy."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <LumenCard title="EXISTING_POSITION" delay={600}>
          <p className="text-white/70">
            Your Uniswap v4 position NFTs will be listed here (via the Farmenta indexer —
            the PositionManager has no on-chain enumeration). Deposit with a single
            signature (ERC-721 permit).
          </p>
          <p className="mt-[10px]">
            Position list, collateral value, max borrow, and health-factor preview coming
            with the contracts.
          </p>
        </LumenCard>
        <LumenCard title="NEW_POSITION" delay={750}>
          <p className="text-white/70">
            Pick an eligible pool, set a range (symmetric ±20–25% preset), and mint +
            deposit + borrow in one transaction.
          </p>
          <p className="mt-[10px]">
            Pool picker with policy checks (hook safety bits, caps) coming with the
            contracts.
          </p>
        </LumenCard>
      </div>
    </div>
  );
}
