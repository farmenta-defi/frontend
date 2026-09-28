import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
 *
 * The files are in the repo (`./fonts`, see its README), not fetched from
 * Google while building: a build that cannot reach Google fails, and one did.
 * Each is a variable font, so one file serves every weight in its range.
 */
const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  variable: "--font-jakarta",
  weight: "500 700",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "400 600",
  display: "swap",
});

const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  variable: "--font-jetbrains",
  weight: "400 500",
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
