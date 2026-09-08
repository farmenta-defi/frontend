import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { LogoMark } from "@/components/ui/logo";

const REPOS = [
  { label: "Architecture spec", href: "https://github.com/farmenta-defi/docs" },
  { label: "Contracts", href: "https://github.com/farmenta-defi/smart-contract" },
  { label: "Frontend", href: "https://github.com/farmenta-defi/frontend" },
] as const;

const PRODUCT = [
  { label: "Markets", href: "/market" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Liquidations", href: "/liquidations" },
  { label: "Risk parameters", href: "/risk" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border pt-px">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-12 pt-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-display text-[16px] font-semibold text-foreground">Farmenta</span>
          </div>
          <p className="mt-4 max-w-xs text-[13px] leading-[20px] text-steel-400">
            Borrow USDG against Uniswap v4 LP position NFTs, without unwinding the position or
            giving up its trading fees.
          </p>
        </div>

        <div>
          <p className="label-xs">Product</p>
          <ul className="mt-4 space-y-2.5">
            {PRODUCT.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="focus-ring rounded text-[13px] text-steel-400 transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="label-xs">Open source</p>
          <ul className="mt-4 space-y-2.5">
            {REPOS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center gap-1 rounded text-[13px] text-steel-400 transition-colors hover:text-foreground"
                >
                  {l.label}
                  <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[12px] text-steel-500 sm:px-8">
          <span>Farmenta · Risk-aware liquidity console</span>
        </div>
      </div>
    </footer>
  );
}
