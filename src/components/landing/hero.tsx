import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { ExampleLoanCard } from "@/components/landing/example-loan-card";
import { buttonClasses } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative flex flex-1 items-center overflow-hidden">
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.1fr_auto]">
        <div>
          <h1
            className="rise font-display max-w-[15ch] text-balance text-[40px] font-semibold leading-[1.06] tracking-[-0.03em] sm:max-w-2xl sm:text-[58px]"
            style={{ animationDelay: "80ms" }}
          >
            <span className="text-foreground">Borrow against your liquidity</span>
            <br />
            <span className="text-brand-300">without unwinding it.</span>
          </h1>

          <p
            className="rise mt-6 max-w-xl text-[16px] leading-[26px] text-steel-300"
            style={{ animationDelay: "160ms" }}
          >
            Deposit a Uniswap v4 LP position NFT as collateral and borrow USDG against it. The
            position stays whole, stays in range, and keeps collecting its trading fees while the
            loan is open.
          </p>

          <div className="rise mt-9 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Link href="/market" className={buttonClasses({ variant: "primary", size: "lg" })}>
              Open app
              <ArrowRight className="size-[18px]" strokeWidth={2} />
            </Link>
            <a
              href="https://docs.farmenta.fun/"
              target="_blank"
              rel="noreferrer"
              className={buttonClasses({ variant: "secondary", size: "lg" })}
            >
              Read docs
              <ArrowUpRight className="size-[18px]" strokeWidth={1.75} />
            </a>
          </div>

          <dl
            className="rise mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-border pt-6"
            style={{ animationDelay: "320ms" }}
          >
            {[
              ["Collateral", "Uniswap v4 LP NFT"],
              ["Borrow asset", "USDG"],
              ["Markets", "Isolated per tier"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="label-xs">{label}</dt>
                <dd className="mt-1.5 text-[13px] font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex justify-center lg:justify-end">
          <ExampleLoanCard />
        </div>
      </div>
    </section>
  );
}
