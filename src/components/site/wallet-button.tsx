"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { TriangleAlert, Wallet } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const shorten = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Wallet state in three shapes: connect, wrong network, connected.
 * Wrong network is the only chrome element allowed to go warm, because
 * being on the wrong chain is a risk state, not a neutral one.
 */
export function WalletButton({ className }: { className?: string }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const connected = mounted && !!account && !!chain;
        const wrongNetwork = connected && chain?.unsupported;

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              aria-hidden={!mounted}
              className={cn(buttonClasses({ variant: "primary", size: "sm" }), className)}
              style={!mounted ? { opacity: 0, pointerEvents: "none" } : undefined}
            >
              <Wallet className="size-4" strokeWidth={1.75} />
              Connect wallet
            </button>
          );
        }

        if (wrongNetwork) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className={cn(
                "focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-warn/45 bg-warn/10 px-3.5 text-[13px] font-medium text-warn transition-colors hover:bg-warn/20",
                className,
              )}
            >
              <TriangleAlert className="size-4" strokeWidth={1.75} />
              Wrong network
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className={cn(
              "focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 text-[13px] font-medium text-foreground transition-colors hover:border-brand-500/50 hover:bg-brand-500/10",
              className,
            )}
          >
            <span className="size-1.5 rounded-full bg-ok" />
            <span className="font-mono text-[12px]">{shorten(account.address)}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
