import Link from "next/link";

import { GridLines } from "@/components/lumen/grid-lines";
import { LumenNav } from "@/components/lumen/nav";

/**
 * Full-screen landing hero, adapted from the "LŪMEN // ÍNDEX" motionsites.ai
 * spec to the Farmenta brand and stack:
 * - accent #AFDDFF on pure black, Manrope UI face, Archivo display face
 *   (license-safe stand-in for Graphik LCG)
 * - nav links and the wallet strip are REAL (wagmi/RainbowKit), shared with
 *   the app pages via components/lumen
 * - background video is an external motionsites asset (see README note)
 */

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
        <LumenNav variant="overlay" />

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
