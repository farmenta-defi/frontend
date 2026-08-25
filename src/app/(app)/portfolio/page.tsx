"use client";

import { useAccount, useReadContract } from "wagmi";

import { LumenCard } from "@/components/lumen/card";
import { PageHeader } from "@/components/page-header";
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
        description="Your loans, health factors, uncollected fees, and supply deposits — with actions to repay, claim fees, adjust liquidity, and withdraw."
      />
      <LumenCard title="WALLET" delay={600}>
        {!isConnected ? (
          <p>
            <span className="text-white/70">[ DISCONNECTED ]</span> — connect a wallet to
            see your positions.
          </p>
        ) : (
          <p>
            <span className="text-[#AFDDFF]">[ CONNECTED ]</span>{" "}
            <span className="text-white/70 break-all">{address}</span>
            {posmBalance !== undefined && (
              <>
                {" — "}holding <span className="text-white">{posmBalance.toString()}</span>{" "}
                Uniswap v4 position NFT{posmBalance === BigInt(1) ? "" : "s"} on Robinhood
                Chain.
              </>
            )}{" "}
            Loan details appear here once the contracts are live.
          </p>
        )}
      </LumenCard>
    </div>
  );
}
