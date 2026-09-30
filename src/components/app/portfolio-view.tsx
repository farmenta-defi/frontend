"use client";

import { useChainModal, useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowRight, Check, Copy, ListFilter, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAccount } from "wagmi";

import { WalletActivity } from "@/components/app/portfolio-activity";
import { BorrowPositions, SupplyPosition, useDeposit } from "@/components/app/portfolio-positions";
import { AddressMark } from "@/components/ui/address-mark";
import { AssetMark, type AssetId } from "@/components/ui/asset-mark";
import { Badge, Dot } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { SelectMenu, type SelectOption } from "@/components/ui/select-menu";
import { Tabs } from "@/components/ui/tabs";
import { chain as farmentaChain } from "@/lib/chain";
import { deployment, NOT_DEPLOYED } from "@/lib/deployment";
import { shortAddress } from "@/lib/format";
import { MARKETS, NETWORKS } from "@/lib/markets";
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
 * transactions (`./portfolio-activity`).
 */

const emptySubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

/**
 * Arbitrum, USDC and USDT are listed but cannot be picked, the same way the
 * market table lists them: Farmenta runs on Robinhood Chain and lends USDG,
 * and the greyed rows say what is planned without pretending it is live.
 */
const CHAINS: SelectOption[] = [
  ...Object.entries(NETWORKS).map(([id, network]) => ({
    id,
    label: network.name,
    mark: <AssetMark asset={id as AssetId} size={18} />,
  })),
  { id: "arbitrum", label: "Arbitrum", mark: <AssetMark asset="arbitrum" size={18} />, disabled: true },
];
const STABLECOINS: SelectOption[] = [
  { id: "USDG", label: "USDG", mark: <AssetMark asset="USDG" size={18} /> },
  { id: "USDC", label: "USDC", mark: <AssetMark asset="USDC" size={18} />, disabled: true },
  { id: "USDT", label: "USDT", mark: <AssetMark asset="USDT" size={18} />, disabled: true },
];

const ALL_NETWORKS: SelectOption[] = [{ id: "all", label: "All networks" }, ...CHAINS];
const ALL_CHAINS: SelectOption[] = [{ id: "all", label: "All chains" }, ...CHAINS];
const ASSETS: SelectOption[] = [{ id: "all", label: "All assets" }, ...STABLECOINS];
const LOANS: SelectOption[] = [{ id: "all", label: "All loans" }, ...STABLECOINS];
const COLLATERAL: SelectOption[] = [
  { id: "all", label: "All collateral" },
  ...MARKETS.map((market) => ({ id: market.id as string, label: market.name })),
];

function Filter({
  label,
  options,
  align,
}: {
  label: string;
  options: readonly SelectOption[];
  align: "left" | "right";
}) {
  const [value, setValue] = useState(options[0].id);
  return (
    <SelectMenu
      label={label}
      variant="ghost"
      align={align}
      value={value}
      options={options}
      onChange={setValue}
      icon={<ListFilter className="size-4" aria-hidden />}
    />
  );
}

function EmptyList({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-xl)] border border-border/70 px-5 py-9 text-center">
      <p className="text-[13px] text-steel-400">{children}</p>
      <Link href="/market" className={buttonClasses({ variant: "primary", size: "sm" })}>
        Browse markets
        <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
      </Link>
    </div>
  );
}

/** A balance over time with nothing in it yet: a level line at zero. */
function FlatSparkline() {
  return (
    <div
      aria-hidden
      className="relative h-[92px] overflow-hidden rounded-xl border border-border/70 bg-black/20"
    >
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
        <p className="text-[13px] text-steel-400">Connect a wallet to see its positions.</p>
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

function SupplySection({ tier, name, connected }: { tier: MarketTier; name: string; connected: boolean }) {
  const [chain, setChain] = useState("all");
  const id = `supply-${name.toLowerCase().replace(/\s+/g, "-")}`;
  const deposit = useDeposit(tier);
  // USDG is read as dollars across the app; the figure is the deposit in USDG.
  const deposited = (connected && deposit ? usdgToNumber(deposit.deposited) : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const holding = connected && deposit !== null && deposit.deposited > 0n;

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-[19px] font-semibold text-foreground">
        {name}
      </h2>

      <div className="surface mt-5 grid items-center gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_minmax(0,200px)]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-steel-400">Your deposits</span>
            <SelectMenu
              label="Chain"
              align="left"
              value={chain}
              options={ALL_CHAINS}
              onChange={setChain}
            />
          </div>
          <p className="font-display tnum mt-3 text-[34px] font-semibold leading-none text-foreground sm:text-[40px]">
            <span className="text-steel-500">$</span>
            {deposited}
          </p>
        </div>

        <FlatSparkline />

        <div className="rounded-xl border border-border/70 bg-white/[0.03] px-5 py-4">
          <p className="text-[13px] text-steel-400">Net APY</p>
          <p className="font-display tnum mt-2 text-[22px] font-semibold leading-none text-foreground">
            0<span className="text-steel-500">%</span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-1">
        <Filter label="Network" options={ALL_NETWORKS} align="right" />
        <Filter label="Asset" options={ASSETS} align="right" />
      </div>

      <div className="mt-2">
        {holding ? (
          <SupplyPosition tier={tier} />
        ) : (
          <EmptyList>
            {connected
              ? `No active supply positions in the ${name} market.`
              : "Connect a wallet to see its supply positions."}
          </EmptyList>
        )}
      </div>
    </section>
  );
}

function Positions({ connected }: { connected: boolean }) {
  return (
    <div className="space-y-12 pt-5">
      {MARKETS.map((market) => (
        <SupplySection key={market.id} tier={market.id} name={market.name} connected={connected} />
      ))}

      <section aria-labelledby="borrow-positions">
        <h2 id="borrow-positions" className="text-[19px] font-semibold text-foreground">
          Borrow positions
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-1">
          <Filter label="Network" options={ALL_NETWORKS} align="left" />
          <Filter label="Loan" options={LOANS} align="left" />
          <Filter label="Collateral" options={COLLATERAL} align="left" />
        </div>
        <div className="mt-2">
          {connected && deployment ? (
            <BorrowPositions empty={<EmptyList>No active borrow positions.</EmptyList>} />
          ) : (
            <EmptyList>
              {connected ? "No active borrow positions." : "Connect a wallet to see its borrow positions."}
            </EmptyList>
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
        <WalletActivity account={address} empty={<EmptyList>No transactions yet.</EmptyList>} />
      ) : (
        <EmptyList>Connect a wallet to see its activity.</EmptyList>
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
