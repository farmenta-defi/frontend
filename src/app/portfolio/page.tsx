"use client";

import { useAccount, useReadContract } from "wagmi";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { contracts, positionManagerAbi } from "@/lib/contracts";

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { data: posmBalance } = useReadContract({
    address: contracts.positionManager,
    abi: positionManagerAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  return (
    <div>
      <PageHeader
        title="Portfolio"
        description="Your loans, health factors, uncollected fees, and lending deposits — with actions to repay, claim fees, adjust liquidity, and withdraw."
      />
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {!isConnected ? (
            <p>Connect a wallet to see your positions.</p>
          ) : (
            <p>
              Connected as <span className="font-mono">{address}</span>
              {posmBalance !== undefined && (
                <>
                  {" — "}holding{" "}
                  <span className="font-mono">{posmBalance.toString()}</span> Uniswap v4
                  position NFT{posmBalance === BigInt(1) ? "" : "s"} on Robinhood Chain.
                </>
              )}{" "}
              Loan details appear here once the contracts are live.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
