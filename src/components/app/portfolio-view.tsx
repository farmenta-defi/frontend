"use client";

import { useChainModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowRight, Check, Copy, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAccount } from "wagmi";

import { FiguresNotice } from "@/components/app/pool-figures";
import { WalletActivity } from "@/components/app/portfolio-activity";
import { BorrowPositions, SupplyPosition, useDeposit } from "@/components/app/portfolio-positions";
import { AddressMark } from "@/components/ui/address-mark";
import { Badge, Dot } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { depositApyPct } from "@/lib/backend/figures";
import { useMarket } from "@/lib/backend/hooks";
import { chain as farmentaChain } from "@/lib/chain";
import { deployment, NOT_DEPLOYED } from "@/lib/deployment";
import { NO_FIGURE, shortAddress } from "@/lib/format";
import { MARKETS } from "@/lib/markets";
import type { MarketTier } from "@/lib/risk-params";
import { usdgToNumber } from "@/lib/units";

/**
 * The account page.
 *
 * Supplying is per market and borrowing is per position, so the page is laid
 * out the same way: one block for each market a wallet can lend into, then the
 * loans it has taken.
 *
 * What the wallet holds is read from the chain: its deposit in each market,
 * and the loans on the positions this browser knows for it. Without a
 * deployment there is nothing to read, and the page says so rather than
 * filling itself with invented positions.
 *
 * What the wallet did is read from the backend: the Activity tab lists its
 * transactions (`./portfolio-activity`). So is the one figure here that is
 * the market's and not the wallet's: the supply APY a deposit earns.
 */

const emptySubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

/**
 * Where a list would be, when there is nothing in it. The way to the markets
 * is offered once a tab, by the panel that has nothing else to show: a section
 * that is empty beside others says so and leaves it there.
 */
function EmptyList({ children, browse = false }: { children: ReactNode; browse?: boolean }) {
  return (
    <div
      className={
        browse
          ? "flex flex-col items-center gap-4 rounded-[var(--radius-xl)] border border-border/70 px-5 py-9 text-center"
          : "rounded-[var(--radius-xl)] border border-border/70 px-5 py-6 text-center"
      }
    >
      <p className="text-[13px] text-steel-400">{children}</p>
      {browse && (
        <Link href="/market" className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Browse markets
          <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** A balance over time with nothing in it yet: a level line at zero. */
function FlatSparkline() {
  return (
    <div aria-hidden className="relative h-[92px] overflow-hidden">
      <div className="absolute inset-x-0 top-[34%] h-10 bg-gradient-to-b from-brand-500/20 to-transparent" />
      <div className="absolute inset-x-0 top-[34%] h-px bg-brand-500" />
    </div>
  );
}

function AccountHeader() {
  const mounted = useMounted();
  const { address, isConnected, chain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  // The wallet is only known in the browser. Until then the row holds its
  // height and shows nothing, so it neither flashes "Connect" at a connected
  // reader nor jumps when the address arrives.
  if (!mounted) return <div className="h-14" aria-hidden />;

  if (!isConnected || !address) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full border border-border bg-white/[0.04] text-steel-400"
        >
          <Wallet className="size-6" strokeWidth={1.5} />
        </span>
        <h1 className="sr-only">Portfolio</h1>
        <button
          type="button"
          onClick={openConnectModal}
          className={buttonClasses({ variant: "primary", size: "md" })}
        >
          <Wallet className="size-[18px]" strokeWidth={1.75} aria-hidden />
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <AddressMark address={address} size={56} />
      <h1
        title={address}
        className="font-mono text-[26px] font-medium leading-none tracking-tight text-foreground sm:text-[32px]"
      >
        {shortAddress(address)}
      </h1>
      <button
        type="button"
        aria-label={copied ? "Address copied" : "Copy address"}
        onClick={() =>
          navigator.clipboard.writeText(address).then(
            () => setCopied(true),
            // Refused by the browser: say nothing rather than claim a copy that did not happen.
            () => {},
          )
        }
        className="focus-ring rounded-lg p-2 text-steel-400 transition-colors hover:bg-white/[0.05] hover:text-foreground"
      >
        {copied ? (
          <Check className="size-4 text-brand-300" strokeWidth={2.5} aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </button>
      {chain?.id === farmentaChain.id ? (
        <Badge tone="ok">
          <Dot tone="ok" />
          Connected
        </Badge>
      ) : (
        // Warm, because a wallet on another chain cannot act on any of this.
        <button type="button" onClick={openChainModal} className="focus-ring rounded-full">
          <Badge tone="warn">
            <TriangleAlert className="size-3" aria-hidden />
            Wrong network
          </Badge>
        </button>
      )}
    </div>
  );
}

function SupplySection({ tier, name }: { tier: MarketTier; name: string }) {
  const id = `supply-${name.toLowerCase().replace(/\s+/g, "-")}`;
  const deposit = useDeposit(tier);
  // USDG is read as dollars across the app; the figure is the deposit in USDG.
  const deposited = (deposit ? usdgToNumber(deposit.deposited) : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const holding = deposit !== null && deposit.deposited > 0n;
  // What the deposit earns: the market's supply APY, which is the backend's figure.
  const market = useMarket(tier);
  const apy = depositApyPct(holding, market.data);

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-[19px] font-semibold text-foreground">
        {name}
      </h2>

      <div className="surface mt-5 grid items-center gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_minmax(0,200px)]">
        <div>
          <p className="text-[13px] text-steel-400">Your deposits</p>
          <p className="font-display tnum mt-3 text-[34px] font-semibold leading-none text-foreground sm:text-[40px]">
            <span className="text-steel-500">$</span>
            {deposited}
          </p>
        </div>

        <FlatSparkline />

        {/* A column of the same card, parted by a rule: not a card of its own. */}
        <div className="border-t border-border/70 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <p className="text-[13px] text-steel-400">Net APY</p>
          <p className="font-display tnum mt-2 text-[22px] font-semibold leading-none text-foreground">
            {apy === null ? (
              <span className={market.status === "loading" ? "animate-pulse text-steel-500" : "text-steel-500"}>
                {NO_FIGURE}
              </span>
            ) : (
              <>
                {apy.toFixed(2)}
                <span className="text-steel-500">%</span>
              </>
            )}
          </p>
        </div>
      </div>
      {/* Said only to a wallet that has a deposit here: nobody else is shown a figure of the backend's. */}
      {holding && <FiguresNotice figures={[market]} className="mt-3" />}

      {/* No deposit is already said by the figure above, so nothing is added under it. */}
      {holding && (
        <div className="mt-4">
          <SupplyPosition tier={tier} />
        </div>
      )}
    </section>
  );
}

function Positions({ connected }: { connected: boolean }) {
  // Nothing on this tab is about anyone until a wallet is connected, so it is
  // said once, not once a section under three figures of zero.
  if (!connected) {
    return (
      <div className="space-y-4 pt-5">
        <EmptyList browse>Deposits and loans are listed here once a wallet is connected.</EmptyList>
        {!deployment && <p className="text-[12px] leading-[18px] text-steel-500">{NOT_DEPLOYED}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-12 pt-5">
      {MARKETS.map((market) => (
        <SupplySection key={market.id} tier={market.id} name={market.name} />
      ))}

      <section aria-labelledby="borrow-positions">
        <h2 id="borrow-positions" className="text-[19px] font-semibold text-foreground">
          Borrow positions
        </h2>
        <div className="mt-4">
          {deployment ? (
            <BorrowPositions empty={<EmptyList>No active borrow positions.</EmptyList>} />
          ) : (
            <EmptyList>No active borrow positions.</EmptyList>
          )}
        </div>
      </section>

      {!deployment && <p className="text-[12px] leading-[18px] text-steel-500">{NOT_DEPLOYED}</p>}
    </div>
  );
}

function Activity({ connected }: { connected: boolean }) {
  const { address } = useAccount();
  return (
    <div className="pt-5">
      {connected && address ? (
        <WalletActivity account={address} empty={<EmptyList browse>No transactions yet.</EmptyList>} />
      ) : (
        <EmptyList browse>Transactions are listed here once a wallet is connected.</EmptyList>
      )}
    </div>
  );
}

export function PortfolioView() {
  const mounted = useMounted();
  const { isConnected } = useAccount();
  const connected = mounted && isConnected;

  return (
    <div>
      <AccountHeader />
      <div className="mt-10">
        <Tabs
          label="Portfolio"
          tabs={[
            { id: "positions", label: "Positions", panel: <Positions connected={connected} /> },
            { id: "activity", label: "Activity", panel: <Activity connected={connected} /> },
          ]}
        />
      </div>
    </div>
  );
}
