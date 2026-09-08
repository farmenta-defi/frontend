import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/footer";
import { SiteNav } from "@/components/site/nav";
import { Toaster } from "@/components/ui/sonner";

/**
 * The chrome every in-app page shares.
 *
 * The footer is opt-in rather than automatic. Working surfaces (the market
 * table, a pool page, the portfolio) end where the next action is, and a
 * sitemap under them only adds distance to it. Reference pages, where a reader
 * has finished and is looking for somewhere to go, keep it.
 */
export function AppShell({ children, footer = false }: { children: ReactNode; footer?: boolean }) {
  return (
    <>
      <SiteNav variant="app" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
      {footer && <SiteFooter />}
      <Toaster position="bottom-right" />
    </>
  );
}
