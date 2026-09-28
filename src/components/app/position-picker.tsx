"use client";

import { useMemo } from "react";

import { buttonClasses } from "@/components/ui/button";
import { fmtUsd, type CollateralPool } from "@/lib/markets";
import { describePosition } from "@/lib/onchain/describe";
import { inPool } from "@/lib/onchain/discovery";
import { usePositions, useSession, useWalletPositions } from "@/lib/onchain/hooks";
import type { PositionState } from "@/lib/onchain/reads";
import { usdgToNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * The positions of this pool the wallet can act on: the ones in the wallet,
 * which can be deposited, and the ones deposited, which can be borrowed
 * against.
 *
 * The list is found in the chain's logs and nothing is typed: a liquidity
 * provider knows a position by its pair, fee and price range, not by its token
 * id, which is shown as a detail.
 */
export type PositionList = {
  positions: readonly PositionState[];
  /** `failed`: the logs could not be read, which is not the wallet having no positions. */
  status: "idle" | "loading" | "failed" | "ready";
  retry: () => void;
};

/** The positions of `pool` the connected wallet holds or has deposited, as the chain has them. */
export function usePoolPositions(pool: CollateralPool): PositionList {
  const discovery = useWalletPositions();
  const found = useMemo(() => inPool(discovery.data ?? [], pool.poolId), [discovery.data, pool.poolId]);
  const details = usePositions(
    pool.tier,
    found.map((position) => position.tokenId),
  );

  const positions = details
    .map((query) => query.data)
    .filter(
      (position): position is PositionState =>
        position !== undefined && (position.place === "wallet" || position.place === "collateral"),
    );
  // The first read only. While the list is read again, or a position that has just arrived is
  // being read, what is on screen stays on screen.
  const reading = discovery.isLoading || (positions.length === 0 && details.some((query) => query.isLoading));

  return {
    positions,
    status: discovery.isError ? "failed" : reading ? "loading" : discovery.data ? "ready" : "idle",
    retry: () => void discovery.refetch(),
  };
}

/** The range and whether the price is in it. Out of range is warm: the position earns no fees there. */
export function RangeLine({ position }: { position: PositionState }) {
  const { range, inRange } = describePosition(position);
  return (
    <>
      {range}
      {range && inRange !== null && " · "}
      {inRange !== null && <span className={cn(!inRange && "text-warn")}>{inRange ? "In range" : "Out of range"}</span>}
    </>
  );
}

export function PositionPicker({
  pool,
  list,
  selected,
  onSelect,
}: {
  pool: CollateralPool;
  list: PositionList;
  selected: bigint | null;
  onSelect: (tokenId: bigint) => void;
}) {
  const session = useSession();
  const note = "mt-3 text-[12px] leading-[19px] text-steel-500";

  if (list.status === "failed") {
    return (
      <div className="mt-3">
        <p className="text-[12px] leading-[19px] text-warn">
          Couldn&apos;t load your positions. The network did not respond.
        </p>
        <button type="button" onClick={list.retry} className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "mt-3")}>
          Try again
        </button>
      </div>
    );
  }
  if (list.status === "loading") return <p className={note}>Looking for your {pool.pair} positions…</p>;
  if (list.status === "idle") {
    return <p className={note}>{session.account ? "" : `Connect a wallet to see its ${pool.pair} positions.`}</p>;
  }
  if (list.positions.length === 0) {
    return (
      <p className={note}>
        This wallet holds no position in this {pool.pair} pool. Open one on Uniswap v4 and it shows up here.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-1.5">
      {list.positions.map((position) => {
        const active = position.tokenId === selected;
        const { fee, valueUsd } = describePosition(position);
        return (
          <button
            key={position.tokenId.toString()}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(position.tokenId)}
            className={cn(
              "focus-ring flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
              active ? "border-brand-400/50 bg-brand-400/[0.07]" : "border-border hover:bg-white/[0.04]",
            )}
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">
                {pool.pair} <span className="text-steel-400">{fee}</span>
              </span>
              <span className="mt-0.5 block text-[11px] text-steel-400">
                <RangeLine position={position} />
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-steel-500">
                {position.place === "collateral"
                  ? position.debt > 0n
                    ? `Deposited · owes ${usdgToNumber(position.debt).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDG`
                    : "Deposited · no loan"
                  : "In your wallet"}{" "}
                · <span className="font-mono">#{position.tokenId.toString()}</span>
              </span>
            </span>
            <span className="tnum shrink-0 text-[13px] font-semibold text-foreground">
              {valueUsd === null ? "" : fmtUsd(valueUsd)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
