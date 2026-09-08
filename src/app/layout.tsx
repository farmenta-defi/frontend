import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { Providers } from "./providers";

/**
 * Three faces, one job each.
 * - Jakarta (display): geometric and slightly rounded, the closest type
 *   answer to the logo's curved arcs. Headlines and figures only.
 * - Inter (UI): the calm, unremarkable face that lending interfaces are
 *   read in. Everything else.
 * - JetBrains Mono: addresses, token ids, pool ids: strings a person
 *   compares character by character.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Farmenta: borrow against your Uniswap v4 LP positions",
    template: "%s · Farmenta",
  },
  description:
    "Deposit a Uniswap v4 LP position NFT as collateral, borrow USDG against it, and keep earning your trading fees. Isolated markets on Robinhood Chain.",
};

export const viewport: Viewport = {
  themeColor: "#05080f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jakarta.variable} ${jetbrains.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
