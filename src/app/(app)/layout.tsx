import type { ReactNode } from "react";

import { Navbar } from "@/components/navbar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Farmenta · built on Uniswap v4 · Robinhood Chain (4663) · MVP — not audited
      </footer>
    </>
  );
}
