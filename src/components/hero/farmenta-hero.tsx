"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Menu, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Full-screen landing hero, adapted from the "LŪMEN // ÍNDEX" motionsites.ai
 * spec to the Farmenta brand and stack:
 * - accent #AFDDFF on pure black, Manrope UI face, Archivo display face
 *   (license-safe stand-in for Graphik LCG)
 * - nav links and the wallet strip are REAL (wagmi/RainbowKit), not decorative
 * - background video is an external motionsites asset (see README note)
 */

const NAV_ITEMS = [
  { number: "01", label: "LEND", href: "/lend", delay: 350 },
  { number: "02", label: "BORROW", href: "/borrow", delay: 450 },
  { number: "03", label: "PORTFOLIO", href: "/portfolio", delay: 550 },
  { number: "04", label: "LIQUIDATIONS", href: "/liquidations", delay: 650 },
  { number: "05", label: "RISK_PARAMS", href: "/risk", delay: 750 },
] as const;

const shorten = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;

/* ------------------------------------------------------------------ */
/* Wallet strip — real wagmi state, styled per the spec               */
/* ------------------------------------------------------------------ */

function WalletStrip({ variant }: { variant: "desktop" | "mobile" }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const connected = mounted && !!account && !!chain;
        const wrongNetwork = connected && chain?.unsupported;
        const onClick = !connected
          ? openConnectModal
          : wrongNetwork
            ? openChainModal
            : openAccountModal;

        const address = connected ? shorten(account.address) : "0x00...0000";
        const status = connected ? "[ CONNECTED ]" : "[ DISCONNECTED ]";
        const chip = !connected ? "GUEST_MODE" : wrongNetwork ? "WRONG_NETWORK" : "ROBINHOOD_CHAIN";

        const chipEl = (
          <span className="font-manrope bg-[#AFDDFF] rounded-[3px] px-[5px] py-[2px] text-black text-[13px] leading-[15.6px] whitespace-nowrap">
            {chip}
          </span>
        );

        if (variant === "mobile") {
          return (
            <button
              type="button"
              onClick={onClick}
              aria-hidden={!mounted}
              className="text-left"
              style={!mounted ? { opacity: 0, pointerEvents: "none" } : undefined}
            >
              <div className="flex items-center gap-[10px] mb-3">
                <Wallet className="w-[15px] h-[15px] text-white" strokeWidth={1.5} />
                <span className="font-manrope text-white text-[13px] leading-[15.6px]">
                  {address}
                </span>
                <span
                  className={`font-manrope text-[13px] leading-[15.6px] ${connected ? "text-[#AFDDFF]" : "text-white/50"}`}
                >
                  {status}
                </span>
              </div>
              <div className="flex items-center gap-[8px]">
                <span className="font-manrope text-white text-[13px] leading-[15.6px]">
                  STATUS:
                </span>
                {chipEl}
              </div>
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={onClick}
            aria-hidden={!mounted}
            className="hidden lg:flex items-center gap-[12px] ml-auto anim-slide-right cursor-pointer"
            style={{
              animationDelay: "600ms",
              ...(!mounted ? { opacity: 0, pointerEvents: "none" } : {}),
            }}
          >
            <Wallet className="w-[15px] h-[15px] text-white" strokeWidth={1.5} />
            <span className="font-manrope text-white text-[13px] leading-[15.6px]">{address}</span>
            <span
              className={`font-manrope text-[13px] leading-[15.6px] ${connected ? "text-[#AFDDFF]" : "text-white/50"}`}
            >
              {status}
            </span>
            <span className="font-manrope text-white text-[13px] leading-[15.6px] ml-[20px]">
              STATUS:
            </span>
            {chipEl}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/* ------------------------------------------------------------------ */
/* Nav item                                                           */
/* ------------------------------------------------------------------ */

function NavItem({
  number,
  label,
  href,
  delay,
}: {
  number: string;
  label: string;
  href: string;
  delay: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-[3px] anim-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="font-manrope text-[#AFDDFF]/80 text-[13px] leading-[15.6px]">
        {number}.
      </span>
      <span className="font-manrope text-white text-[13px] leading-[15.6px] cursor-pointer hover:text-[#AFDDFF] transition-colors">
        {label}
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Grid lines + plus intersections                                    */
/* ------------------------------------------------------------------ */

const verticalPositions = ["12.6%", "37.5%", "61.9%", "86.2%"];
const horizontalPositions = ["32.7%", "71.4%"];

function GridLines() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {verticalPositions.map((left, i) => (
        <div
          key={`v-${left}`}
          className="absolute top-0 h-full w-px bg-white/[0.04] anim-grid-v"
          style={{ left, animationDelay: `${600 + i * 100}ms` }}
        />
      ))}
      {horizontalPositions.map((top, i) => (
        <div
          key={`h-${top}`}
          className="absolute left-0 w-full h-px bg-white/[0.04] anim-grid-h"
          style={{ top, animationDelay: `${800 + i * 150}ms` }}
        />
      ))}
      {horizontalPositions.map((top, hi) =>
        verticalPositions.map((left, vi) => (
          <div
            key={`plus-${top}-${left}`}
            className="absolute anim-scale-in"
            style={{ top, left, animationDelay: `${1000 + (hi * 4 + vi) * 80}ms` }}
          >
            <div className="absolute w-[10px] h-px bg-white/70 -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute w-px h-[10px] bg-white/70 -translate-x-1/2 -translate-y-1/2" />
          </div>
        )),
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Central nodes — squares, labels, connectors                        */
/* ------------------------------------------------------------------ */

function ConnectorLine({
  x1,
  y1,
  x2,
  y2,
  delay,
}: {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  delay: number;
}) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none anim-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function CentralNodes() {
  return (
    <div className="absolute inset-0 pointer-events-none hidden md:block">
      {/* connectors — elbow pairs landing on each square's top-left corner */}
      <ConnectorLine x1="38%" y1="14%" x2="52%" y2="14%" delay={1200} />
      <ConnectorLine x1="52%" y1="14%" x2="60%" y2="27%" delay={1400} />
      <ConnectorLine x1="32%" y1="58%" x2="20%" y2="74%" delay={1500} />
      <ConnectorLine x1="20%" y1="74%" x2="6%" y2="74%" delay={1700} />
      <ConnectorLine x1="78%" y1="53%" x2="63%" y2="53%" delay={1800} />
      <ConnectorLine x1="63%" y1="53%" x2="50%" y2="63%" delay={2000} />

      {/* squares */}
      <div
        className="absolute top-[27%] left-[60%] w-[80px] h-[80px] lg:w-[100px] lg:h-[100px] border border-white/80 anim-scale-in"
        style={{ animationDelay: "1500ms" }}
      />
      <div
        className="absolute top-[58%] left-[32%] w-[80px] h-[80px] lg:w-[100px] lg:h-[100px] border border-white/80 anim-scale-in"
        style={{ animationDelay: "1800ms" }}
      />
      <div
        className="absolute top-[63%] left-[50%] w-[80px] h-[80px] lg:w-[100px] lg:h-[100px] border border-white/80 anim-scale-in"
        style={{ animationDelay: "2100ms" }}
      />

      {/* labels */}
      <div className="absolute top-[11%] left-[26%] anim-slide-left" style={{ animationDelay: "1100ms" }}>
        <span className="font-manrope text-white text-[13px] leading-[15.6px] whitespace-nowrap">
          [ LP_COLLATERAL ]
        </span>
        <p className="font-manrope text-white/50 text-[11px] leading-[14px] mt-[4px] max-w-[160px]">
          Uniswap v4 position NFTs held as productive collateral.
        </p>
      </div>
      <div className="absolute top-[76%] left-[3%] anim-slide-left" style={{ animationDelay: "1400ms" }}>
        <span className="font-manrope text-white text-[13px] leading-[15.6px] whitespace-nowrap">
          [ ISOLATED_MARKETS ]
        </span>
        <p className="font-manrope text-white/50 text-[11px] leading-[14px] mt-[4px] max-w-[160px]">
          Blue-chip and meme risk, walled off in separate pools.
        </p>
      </div>
      <div className="absolute top-[50%] left-[78%] anim-slide-right" style={{ animationDelay: "1700ms" }}>
        <span className="font-manrope text-white text-[13px] leading-[15.6px] whitespace-nowrap">
          [ LIQUIDATION_ENGINE ]
        </span>
        <p className="font-manrope text-white/50 text-[11px] leading-[14px] mt-[4px] max-w-[180px]">
          Health-factor liquidations keep lenders whole.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

export function FarmentaHero() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section className="relative w-full h-dvh overflow-hidden bg-black">
      {/* layer 0 — background video (external motionsites asset) */}
      <video
        className="absolute inset-0 w-full h-full object-cover anim-fade-in"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260813_115057_94c3699b-0fd1-4124-bcf3-3626bb8c1f77.mp4"
        autoPlay
        muted
        loop
        playsInline
      />

      {/* content layer */}
      <div className="relative z-10 w-full h-full">
        {/* top nav */}
        <nav className="absolute top-0 left-0 w-full flex items-center px-5 md:px-[35px] py-5 md:py-[27px]">
          <div className="flex items-center gap-[40px]">
            <Link
              href="/"
              className="font-graphik text-white text-[18px] md:text-[21px] leading-[21px] whitespace-nowrap anim-fade-up"
              style={{ animationDelay: "200ms" }}
            >
              FARMENTA {"//"} V4
            </Link>
            <div className="hidden lg:flex items-center gap-[40px]">
              {NAV_ITEMS.map((item) => (
                <NavItem key={item.number} {...item} />
              ))}
            </div>
          </div>

          <WalletStrip variant="desktop" />

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
                  key={item.number}
                  className={`transition-all duration-500 ease-[cubic-bezier(0.76,0,0.24,1)] ${
                    menuOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"
                  }`}
                  style={{ transitionDelay: menuOpen ? `${150 + i * 75}ms` : "0ms" }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3"
                  >
                    <span className="font-manrope text-[#AFDDFF]/80 text-[14px] leading-[1]">
                      {item.number}.
                    </span>
                    <span className="font-manrope text-white text-[28px] leading-[1.2] tracking-tight">
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
              <WalletStrip variant="mobile" />
            </div>
          </div>
        </div>

        {/* H1 */}
        <h1
          className="font-graphik text-white font-normal leading-[1em] absolute anim-fade-up text-[32px] sm:text-[48px] md:text-[68px] top-[140px] sm:top-[160px] md:top-[178px] left-5 md:left-[35px] max-w-[300px] sm:max-w-[420px] md:max-w-[554px]"
          style={{ animationDelay: "400ms" }}
        >
          Liquid Positions. Solid Credit.
        </h1>

        <GridLines />
        <CentralNodes />

        {/* bottom row */}
        <div className="absolute bottom-5 md:bottom-[35px] left-5 md:left-[35px] right-5 md:right-[35px] flex flex-col md:flex-row items-start md:items-end justify-between gap-5 md:gap-0">
          {/* CTA */}
          <Link
            href="/borrow"
            className="bg-[#AFDDFF] px-[16px] md:px-[20px] py-[10px] md:py-[12px] flex items-center gap-[10px] hover:bg-[#c8e8ff] transition-colors anim-fade-up"
            style={{ animationDelay: "900ms" }}
          >
            <span className="text-black text-[16px] leading-none">&#10022;</span>
            <span className="font-manrope text-black text-[12px] md:text-[13px] leading-[15.6px] uppercase tracking-wide">
              Borrow Against Your LP
            </span>
          </Link>

          {/* info card */}
          <div
            className="relative max-w-[280px] hidden sm:block anim-slide-right"
            style={{ animationDelay: "1100ms" }}
          >
            <span className="font-manrope text-black text-[13px] leading-[15.6px] bg-[#AFDDFF] px-[6px] py-[2px] inline-block mb-[10px]">
              NOT A BANK — AN LP CREDIT LAYER
            </span>
            <div className="relative p-[20px]">
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 280 168"
                preserveAspectRatio="none"
              >
                <polygon
                  points="0.5,0.5 279.5,0.5 279.5,167.5 30,167.5 0.5,137.5"
                  fill="none"
                  stroke="#AFDDFF"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <p className="relative font-manrope text-white text-[13px] leading-[18px] mb-[18px]">
                Farmenta turns Uniswap v4 LP positions into living collateral — borrow
                USDG while your liquidity keeps earning fees on Robinhood Chain.
              </p>
              <Link
                href="/risk"
                className="relative font-manrope text-[#AFDDFF] text-[13px] leading-[15.6px] cursor-pointer hover:underline"
              >
                VIEW_RISK_PARAMETERS
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
