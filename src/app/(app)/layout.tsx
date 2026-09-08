import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/footer";
import { SiteNav } from "@/components/site/nav";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav variant="app" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
      <SiteFooter />
      <Toaster position="bottom-right" />
    </>
  );
}
