"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { WalletStrip } from "./wallet-strip";

export const NAV_ITEMS = [
  { label: "MARKET", href: "/market", delay: 350 },
  { label: "PORTFOLIO", href: "/portfolio", delay: 450 },
  { label: "LIQUIDATIONS", href: "/liquidations", delay: 550 },
  { label: "RISK PARAMS", href: "/risk", delay: 650 },
] as const;

/**
 * Landing-only CTA that replaces the wallet strip: the wallet is
 * connected inside the app, not on the marketing hero.
 */
function AppButton({
  variant,
  onNavigate,
}: {
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  if (variant === "mobile") {
    return (
      <Link
        href="/market"
        onClick={onNavigate}
        className="inline-flex items-center gap-[10px] bg-[#AFDDFF] px-[20px] py-[12px] hover:bg-[#c8e8ff] transition-colors"
      >
        <span className="text-black text-[16px] leading-none">&#10022;</span>
        <span className="font-manrope text-black text-[13px] leading-[15.6px] uppercase tracking-wide">
          App
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/market"
      className="hidden lg:flex ml-auto items-center gap-[10px] bg-[#AFDDFF] px-[16px] py-[8px] hover:bg-[#c8e8ff] transition-colors anim-slide-right"
      style={{ animationDelay: "600ms" }}
    >
      <span className="text-black text-[13px] leading-none">&#10022;</span>
      <span className="font-manrope text-black text-[13px] leading-[15.6px] uppercase tracking-wide">
        App
      </span>
    </Link>
  );
}

function NavItem({
  label,
  href,
  delay,
  active,
}: {
  label: string;
  href: string;
  delay: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center anim-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`font-manrope text-[13px] leading-[15.6px] cursor-pointer transition-colors ${
          active ? "text-[#AFDDFF]" : "text-white hover:text-[#AFDDFF]"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

/**
 * LŪMEN-style top navigation shared by the hero (variant "overlay",
 * absolutely positioned over the video) and the app pages (variant
 * "page", in normal flow with a hairline bottom border).
 */
export function LumenNav({ variant }: { variant: "overlay" | "page" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <nav
        className={`${
          variant === "overlay"
            ? "absolute top-0 left-0"
            : "relative z-20 border-b border-white/10 bg-black"
        } w-full flex items-center px-5 md:px-[35px] py-5 md:py-[27px]`}
      >
        <div className="flex items-center gap-[40px]">
          <Link
            href="/"
            className="font-graphik text-white text-[18px] md:text-[21px] leading-[21px] whitespace-nowrap anim-fade-up"
            style={{ animationDelay: "200ms" }}
          >
            FARMENTA
          </Link>
          <div className="hidden lg:flex items-center gap-[40px]">
            {NAV_ITEMS.map((item) => (
              <NavItem key={item.href} {...item} active={pathname?.startsWith(item.href)} />
            ))}
          </div>
        </div>

        {variant === "overlay" ? (
          <AppButton variant="desktop" />
        ) : (
          <WalletStrip variant="desktop" />
        )}

        {/* hamburger */}
        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((v) => !v)}
          className="lg:hidden ml-auto relative w-[40px] h-[40px] flex items-center justify-center anim-fade-in"
          style={{ animationDelay: "400ms" }}
        >
          <span
            className={`absolute transition-all duration-300 ease-[cubic-bezier(0.76,0,0.24,1)] ${
              menuOpen ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
            }`}
          >
            <Menu className="w-[22px] h-[22px] text-white" strokeWidth={1.5} />
          </span>
          <span
            className={`absolute transition-all duration-300 ease-[cubic-bezier(0.76,0,0.24,1)] ${
              menuOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
            }`}
          >
            <X className="w-[22px] h-[22px] text-white" strokeWidth={1.5} />
          </span>
        </button>
      </nav>

      {/* mobile menu overlay */}
      <div
        className={`fixed inset-0 z-50 lg:hidden transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${
          menuOpen ? "visible" : "invisible"
        }`}
      >
        <div
          className={`absolute inset-0 bg-black/90 backdrop-blur-md transition-opacity duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
        />
        <div
          className={`relative h-full flex flex-col px-5 pt-24 pb-10 transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${
            menuOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
          }`}
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute top-5 right-5 w-[40px] h-[40px] flex items-center justify-center"
          >
            <X className="w-[22px] h-[22px] text-white" strokeWidth={1.5} />
          </button>

          <div className="flex flex-col gap-8">
            {NAV_ITEMS.map((item, i) => (
              <div
                key={item.href}
                className={`transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${
                  menuOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"
                }`}
                style={{ transitionDelay: menuOpen ? `${150 + i * 75}ms` : "0ms" }}
              >
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center"
                >
                  <span
                    className={`font-manrope text-[28px] leading-[1.2] tracking-tight ${
                      pathname?.startsWith(item.href) ? "text-[#AFDDFF]" : "text-white"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </div>
            ))}
          </div>

          <div
            className={`mt-auto pt-10 border-t border-white/10 transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${
              menuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: menuOpen ? "450ms" : "0ms" }}
          >
            {variant === "overlay" ? (
              <AppButton variant="mobile" onNavigate={() => setMenuOpen(false)} />
            ) : (
              <WalletStrip variant="mobile" />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
