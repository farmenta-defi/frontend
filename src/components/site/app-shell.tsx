import type { ReactNode } from "react";

import { SiteNav } from "@/components/site/nav";

/** The chrome every in-app page shares. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav variant="app" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
    </>
  );
}
