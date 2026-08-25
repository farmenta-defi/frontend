"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";

const shorten = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;

/**
 * Real wagmi wallet state in the LŪMEN strip style:
 * - disconnected → accent CONNECT chip (opens the connect modal)
 * - wrong network → accent WRONG_NETWORK chip (opens the chain modal)
 * - connected → wallet icon + shortened address (opens the account modal)
 */
export function WalletStrip({ variant }: { variant: "desktop" | "mobile" }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const connected = mounted && !!account && !!chain;
        const wrongNetwork = connected && chain?.unsupported;
        const onClick = !connected
          ? openConnectModal
          : wrongNetwork
            ? openChainModal
            : openAccountModal;

        const content =
          connected && !wrongNetwork ? (
            <>
              <Wallet className="w-[15px] h-[15px] text-white" strokeWidth={1.5} />
              <span className="font-manrope text-white text-[13px] leading-[15.6px]">
                {shorten(account.address)}
              </span>
            </>
          ) : (
            <span className="font-manrope bg-[#AFDDFF] rounded-[3px] px-[10px] py-[4px] text-black text-[13px] leading-[15.6px] whitespace-nowrap transition-colors hover:bg-[#c8e8ff]">
              {wrongNetwork ? "WRONG_NETWORK" : "CONNECT"}
            </span>
          );

        if (variant === "mobile") {
          return (
            <button
              type="button"
              onClick={onClick}
              aria-hidden={!mounted}
              className="flex items-center gap-[10px] text-left"
              style={!mounted ? { opacity: 0, pointerEvents: "none" } : undefined}
            >
              {content}
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={onClick}
            aria-hidden={!mounted}
            className="hidden lg:flex items-center gap-[10px] ml-auto anim-slide-right cursor-pointer"
            style={{
              animationDelay: "600ms",
              ...(!mounted ? { opacity: 0, pointerEvents: "none" } : {}),
            }}
          >
            {content}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
