"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { fmtUsd, type CollateralPool } from "@/lib/markets";
import { samePool } from "@/lib/onchain/contracts";
import { explainError } from "@/lib/onchain/errors";
import { marketRefs, usePositions, useSession, useTrackedPositions } from "@/lib/onchain/hooks";
import { readPosition, type PositionState } from "@/lib/onchain/reads";
import { parseTokenId } from "@/lib/onchain/tracked-positions";
import { chainKeys } from "@/lib/query-keys";
import { usdgToNumber, wadToNumber } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * The positions of this pool the wallet can act on: the ones in the wallet,
 * which can be deposited, and the ones deposited, which can be borrowed
 * against.
 *
 * The chain cannot list a wallet's positions, so the list is the token ids
 * this browser knows for the wallet, each read from the chain. A position is
 * added by its token id, which is the number in its Uniswap URL.
 */
const usable = (position: PositionState | undefined, pool: CollateralPool) =>
  position !== undefined &&
  (position.place === "wallet" || position.place === "collateral") &&
  position.poolId !== null &&
  samePool(position.poolId, pool.poolId);

/** Why a token id that was typed in does not belong on this pool's list, or nothing when it does. */
function refusalOf(position: PositionState, pool: CollateralPool) {
  if (position.place === "missing") return `Position #${position.tokenId} does not exist.`;
  if (position.place === "elsewhere") return `Position #${position.tokenId} is not in your wallet and is not your collateral.`;
  if (!position.poolId || !samePool(position.poolId, pool.poolId)) {
    return `Position #${position.tokenId} provides liquidity to another pool, not to ${pool.pair}.`;
  }
  return null;
}

/** The positions of `pool` this browser knows for the wallet, as the chain has them. */
export function usePoolPositions(pool: CollateralPool) {
  const { tokenIds } = useTrackedPositions();
  return usePositions(pool.tier, tokenIds)
    .map((query) => query.data)
    .filter((position): position is PositionState => usable(position, pool));
}

export function PositionPicker({
  pool,
  positions,
  selected,
  onSelect,
}: {
  pool: CollateralPool;
  positions: readonly PositionState[];
  selected: bigint | null;
  onSelect: (tokenId: bigint) => void;
}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const tracked = useTrackedPositions();

  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const refs = marketRefs(pool.tier);
  const ready = Boolean(refs && session.account && session.publicClient);

  const add = async () => {
    const tokenId = parseTokenId(text);
    if (tokenId === null) return setNote("Enter the position's token id, a whole number.");
    if (!refs || !session.account || !session.publicClient) return;

    setLooking(true);
    setNote(null);
    try {
      const { publicClient, account } = session;
      const position = await queryClient.fetchQuery({
        queryKey: chainKeys.position(pool.tier, tokenId, account),
        queryFn: () => readPosition(publicClient, refs, tokenId, account),
      });
      const refusal = refusalOf(position, pool);
      if (refusal) return setNote(refusal);

      tracked.add(tokenId);
      onSelect(tokenId);
      setText("");
    } catch (error) {
      setNote(explainError(error).message);
    } finally {
      setLooking(false);
    }
  };

  return (
    <>
      {positions.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {positions.map((position) => {
            const isActive = position.tokenId === selected;
            const deposited = position.place === "collateral";
            return (
              <button
                key={position.tokenId.toString()}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(position.tokenId)}
                className={cn(
                  "focus-ring flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  isActive ? "border-brand-400/50 bg-brand-400/[0.07]" : "border-border hover:bg-white/[0.04]",
                )}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[12px] text-foreground">#{position.tokenId.toString()}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-steel-500">
                    {deposited
                      ? position.debt > 0n
                        ? `Deposited · owes ${usdgToNumber(position.debt).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDG`
                        : "Deposited · no loan"
                      : "In your wallet"}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[13px] font-semibold text-foreground">
                  {position.risk ? fmtUsd(wadToNumber(position.risk.positionValue)) : ""}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[12px] leading-[19px] text-steel-500">
          No {pool.pair} position added yet. Add a Uniswap v4 position by its token id to deposit it and
          borrow against it.
        </p>
      )}

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label htmlFor="position-token-id" className="sr-only">
          Token id of a position to add
        </label>
        <input
          id="position-token-id"
          inputMode="numeric"
          placeholder="Token id"
          value={text}
          disabled={!ready || looking}
          onChange={(event) => {
            setText(event.target.value.replace(/[^0-9]/g, ""));
            setNote(null);
          }}
          className="focus-ring tnum h-9 min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 font-mono text-[12px] text-foreground outline-none placeholder:text-steel-600 disabled:opacity-45"
        />
        <button
          type="submit"
          disabled={!ready || looking || text === ""}
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          {looking ? "Looking…" : "Add"}
        </button>
      </form>
      {note && <p className="mt-2 text-[11px] leading-[17px] text-warn">{note}</p>}
    </>
  );
}
