import type { ReactNode } from "react";

import { AppShell } from "@/components/site/app-shell";

/**
 * Working surfaces: the market table, a pool page, and the portfolio. Each one
 * ends at whatever the reader does next, so no sitemap sits underneath.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
