"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";

const shorten = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;

/** Real wagmi wallet state rendered in the LŪMEN strip style. */
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

        const address = connected ? shorten(account.address) : "0x00...0000";
        const status = connected ? "[ CONNECTED ]" : "[ DISCONNECTED ]";
        const chip = !connected ? "GUEST_MODE" : wrongNetwork ? "WRONG_NETWORK" : "ROBINHOOD_CHAIN";

        const chipEl = (
          <span className="font-manrope bg-[#AFDDFF] rounded-[3px] px-[5px] py-[2px] text-black text-[13px] leading-[15.6px] whitespace-nowrap">
            {chip}
          </span>
        );

        if (variant === "mobile") {
          return (
            <button
              type="button"
              onClick={onClick}
              aria-hidden={!mounted}
              className="text-left"
              style={!mounted ? { opacity: 0, pointerEvents: "none" } : undefined}
            >
              <div className="flex items-center gap-[10px] mb-3">
                <Wallet className="w-[15px] h-[15px] text-white" strokeWidth={1.5} />
                <span className="font-manrope text-white text-[13px] leading-[15.6px]">
                  {address}
                </span>
                <span
                  className={`font-manrope text-[13px] leading-[15.6px] ${connected ? "text-[#AFDDFF]" : "text-white/50"}`}
                >
                  {status}
                </span>
              </div>
              <div className="flex items-center gap-[8px]">
                <span className="font-manrope text-white text-[13px] leading-[15.6px]">
                  STATUS:
                </span>
                {chipEl}
              </div>
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={onClick}
            aria-hidden={!mounted}
            className="hidden lg:flex items-center gap-[12px] ml-auto anim-slide-right cursor-pointer"
            style={{
              animationDelay: "600ms",
              ...(!mounted ? { opacity: 0, pointerEvents: "none" } : {}),
            }}
          >
            <Wallet className="w-[15px] h-[15px] text-white" strokeWidth={1.5} />
            <span className="font-manrope text-white text-[13px] leading-[15.6px]">{address}</span>
            <span
              className={`font-manrope text-[13px] leading-[15.6px] ${connected ? "text-[#AFDDFF]" : "text-white/50"}`}
            >
              {status}
            </span>
            <span className="font-manrope text-white text-[13px] leading-[15.6px] ml-[20px]">
              STATUS:
            </span>
            {chipEl}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
