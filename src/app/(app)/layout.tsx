import type { ReactNode } from "react";

import { AppShell } from "@/components/site/app-shell";

/** Reference pages: a reader who reaches the bottom wants somewhere to go next. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell footer>{children}</AppShell>;
}
