"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/ui/logo";
import { buttonClasses } from "@/components/ui/button";
import { WalletButton } from "@/components/site/wallet-button";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { label: "Markets", href: "/market" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Liquidations", href: "/liquidations" },
  { label: "Risk", href: "/risk" },
] as const;

/**
 * `landing` sends people into the app; `app` shows the wallet, because
 * that is the only page group where a wallet does anything.
 */
export function SiteNav({ variant = "app" }: { variant?: "landing" | "app" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled || open
          ? "border-b border-border bg-[rgba(5,8,15,0.82)] backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="focus-ring rounded-md" aria-label="Farmenta home">
          <Logo priority />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-brand-400/10 text-brand-300"
                    : "text-steel-400 hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          {variant === "landing" ? (
            <Link href="/market" className={buttonClasses({ variant: "primary", size: "sm" })}>
              Open app
              <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
          ) : (
            <WalletButton />
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Close menu" : "Open menu"}
          className="focus-ring ml-auto rounded-lg p-2 text-steel-300 transition-colors hover:bg-white/[0.05] hover:text-foreground md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-navigation" className="border-t border-border bg-[rgba(5,8,15,0.96)] px-5 pb-5 pt-3 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "focus-ring rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                    active ? "bg-brand-400/10 text-brand-300" : "text-steel-300",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4" onClick={() => setOpen(false)}>
            {variant === "landing" ? (
              <Link
                href="/market"
                className={cn(buttonClasses({ variant: "primary", size: "md" }), "w-full")}
              >
                Open app
                <ArrowRight className="size-4" strokeWidth={2} />
              </Link>
            ) : (
              <WalletButton className="w-full justify-center" />
            )}
          </div>
        </div>
      )}
    </header>
  );
}
