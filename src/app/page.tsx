import Link from "next/link";

import { LiveStats } from "@/components/live-stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    title: "1 · Provide liquidity",
    body: "LP on Uniswap v4 — through Farmenta in one flow, or bring the position NFT you already have.",
  },
  {
    title: "2 · Borrow USDG",
    body: "Deposit the position NFT as collateral and borrow USDG against its oracle-priced value, while it keeps earning fees.",
  },
  {
    title: "3 · Stay healthy",
    body: "If the health factor drops below 1, the position is partially liquidated to protect lenders. Repay anytime, withdraw when debt is zero.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex flex-col gap-12">
      <section className="mx-auto max-w-2xl pt-8 text-center">
        <p className="mb-3 text-sm font-medium text-emerald-500">
          Lending on Robinhood Chain · powered by Uniswap v4 positions
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          Your LP position is collateral now
        </h1>
        <p className="mt-4 text-muted-foreground text-pretty">
          Farmenta lets you borrow USDG against Uniswap v4 LP NFTs — blue-chip and meme
          pairs, in isolated markets — without closing your position or giving up its fees.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button size="lg" render={<Link href="/borrow" />}>
            Borrow against my LP
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/lend" />}>
            Lend USDG
          </Button>
        </div>
      </section>

      <LiveStats />

      <section className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle className="text-base">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm leading-relaxed">{s.body}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
