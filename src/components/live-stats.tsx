"use client";

import { useReadContract } from "wagmi";

import { contracts, positionManagerAbi } from "@/lib/contracts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Small proof-of-wiring widget: reads Uniswap v4 PositionManager.nextTokenId()
 * live from Robinhood Chain. Replaced by real market stats once FarmentaMarket
 * is deployed.
 */
export function LiveStats() {
  const { data: nextTokenId, isLoading } = useReadContract({
    address: contracts.positionManager,
    abi: positionManagerAbi,
    functionName: "nextTokenId",
  });

  const stats = [
    {
      label: "Uniswap v4 positions minted on Robinhood Chain",
      value:
        nextTokenId !== undefined
          ? (nextTokenId - BigInt(1)).toLocaleString("en-US")
          : undefined,
    },
    { label: "Isolated markets", value: "2 (Blue-chip · Meme)" },
    { label: "Loan asset", value: "USDG" },
  ] as const;

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="pt-6">
            {s.value === undefined && isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {s.value ?? "—"}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
