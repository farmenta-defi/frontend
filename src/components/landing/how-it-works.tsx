import { Coins, Droplets, Layers, Scale } from "lucide-react";

const STEPS = [
  {
    icon: Droplets,
    step: "01",
    title: "Deposit the position NFT",
    body: "Transfer a listed Uniswap v4 LP position into the market. It is held in custody, not dissolved: the liquidity stays in the pool and the fee counter keeps running.",
  },
  {
    icon: Coins,
    step: "02",
    title: "Borrow USDG against it",
    body: "The position is valued from oracle prices, not from spot alone. Borrow up to the market's max LTV: 65% on blue chip, 30% on meme.",
  },
  {
    icon: Scale,
    step: "03",
    title: "Watch one number",
    body: "The health factor is position value × liquidation threshold ÷ debt. Above 1 the loan is yours; at 1 a liquidator may repay part of it and take a slice of the position.",
  },
  {
    icon: Layers,
    step: "04",
    title: "Repay and take it back",
    body: "Repay at any time, collect the fees the position earned along the way, and withdraw the same NFT you deposited.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
      <div className="max-w-2xl">
        <p className="label-xs">How it works</p>
        <h2 className="font-display mt-3 text-[28px] font-semibold leading-tight text-foreground sm:text-[34px]">
          Four steps, and the position never leaves the pool
        </h2>
        <p className="mt-4 text-[15px] leading-[24px] text-steel-400">
          Selling LP tokens to raise cash costs you the fees and the position. Farmenta lends
          against the position instead, so the only thing you give up is the ability to withdraw
          it while the loan is open.
        </p>
      </div>

      <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li
              key={s.step}
              className="surface rise relative p-5"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-400/10 text-brand-300">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="font-mono text-[12px] text-steel-600">{s.step}</span>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-foreground">{s.title}</h3>
              <p className="mt-2 text-[13px] leading-[21px] text-steel-400">{s.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
