import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Risk parameters" };

const rows = [
  ["Max LTV at borrow", "65%", "30%"],
  ["Liquidation threshold", "75%", "40%"],
  ["Liquidator bonus (net)", "5%", "10%"],
  ["Protocol liquidation fee", "0.5% of repay", "2% of repay"],
  ["Close factor", "50% (100% if HF < 0.9)", "100%"],
  ["Debt cap per pool", "≤ 10% of pool TVL", "≤ 5% of pool TVL, max $20k"],
  ["Market debt cap (initial)", "$500,000", "$50,000"],
  ["Price source", "Chainlink (Pyth check)", "30-min TWAP, min(spot, TWAP) to borrow"],
  ["Reserve factor", "15%", "25%"],
  ["Interest model (kink / slope1 / slope2)", "80% / 4% / 60%", "70% / 8% / 100%"],
] as const;

export default function RiskPage() {
  return (
    <div>
      <PageHeader
        title="Risk parameters"
        description="Initial parameters per isolated market, as specified in the Farmenta architecture (v0.2). Subject to simulation before real TVL. Health factor = position value × liquidation threshold ÷ debt."
        wip={false}
      />
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parameter</TableHead>
              <TableHead>Blue-chip · USDG</TableHead>
              <TableHead>Meme · USDG</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([p, bc, meme]) => (
              <TableRow key={p}>
                <TableCell className="font-medium">{p}</TableCell>
                <TableCell className="text-muted-foreground">{bc}</TableCell>
                <TableCell className="text-muted-foreground">{meme}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Full specification:{" "}
        <a
          className="underline underline-offset-4 hover:text-foreground"
          href="https://github.com/farmenta-defi/docs/blob/main/ARCHITECTURE.md"
          target="_blank"
          rel="noreferrer"
        >
          farmenta-defi/docs · ARCHITECTURE.md
        </a>
      </p>
    </div>
  );
}
