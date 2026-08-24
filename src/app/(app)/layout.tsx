import type { ReactNode } from "react";

import { GridLines } from "@/components/lumen/grid-lines";
import { LumenNav } from "@/components/lumen/nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col bg-black text-white">
      <GridLines fixed />
      <LumenNav variant="page" />
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-5 md:px-[35px] py-10 md:py-[50px]">
        {children}
      </main>
      <footer className="relative z-10 border-t border-white/10 py-6 text-center font-manrope text-[11px] leading-[14px] text-white/40">
        FARMENTA {"//"} V4 · BUILT ON UNISWAP V4 · ROBINHOOD_CHAIN:4663 · [ MVP —
        NOT_AUDITED ]
      </footer>
    </div>
  );
}
