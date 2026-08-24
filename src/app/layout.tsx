import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Navbar } from "@/components/navbar";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Farmenta",
    template: "%s · Farmenta",
  },
  description:
    "Borrow against your Uniswap v4 LP positions on Robinhood Chain. Deposit your position NFT as collateral, borrow USDG, keep earning fees.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          <Navbar />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
            Farmenta · built on Uniswap v4 · Robinhood Chain (4663) · MVP — not audited
          </footer>
        </Providers>
      </body>
    </html>
  );
}
