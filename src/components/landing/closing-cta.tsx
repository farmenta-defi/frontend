import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { VortexGlow } from "@/components/ui/logo";

export function ClosingCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-12 sm:px-8">
      <div className="surface relative overflow-hidden px-6 py-14 text-center sm:px-12 sm:py-20">
        <VortexGlow
          size={560}
          opacity={0.35}
          className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        />
        <div className="relative">
          <h2 className="font-display mx-auto max-w-xl text-[28px] font-semibold leading-tight text-foreground sm:text-[36px]">
            Your liquidity is already working. Put it to work twice.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-[24px] text-steel-400">
            Connect a wallet to see the Uniswap v4 positions you already hold and what they can
            borrow.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/market" className={buttonClasses({ variant: "primary", size: "lg" })}>
              Open app
              <ArrowRight className="size-[18px]" strokeWidth={2} />
            </Link>
            <Link href="/risk" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              Read the risks first
              <ArrowUpRight className="size-[18px]" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
