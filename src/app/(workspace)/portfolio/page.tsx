import type { Metadata } from "next";

import { PortfolioView } from "@/components/app/portfolio-view";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return <PortfolioView />;
}
