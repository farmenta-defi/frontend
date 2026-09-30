"use client";

import { ArrowUpRight, ListFilter } from "lucide-react";
import { useState } from "react";

import { AddressMark } from "@/components/ui/address-mark";
import { AssetMark } from "@/components/ui/asset-mark";
import { buttonClasses } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  activityLabel,
  POOL_ACTIVITY_FILTERS,
  type PoolActivityFilter,
  type PoolActivityRow,
} from "@/lib/backend/activity";
import { historyFailureMessage } from "@/lib/backend/client";
import { usePoolActivity } from "@/lib/backend/hooks";
import { chain } from "@/lib/chain";
import { fmtTimestampUtc, fmtUsdgFull, NO_FIGURE, shortAddress } from "@/lib/format";
import type { CollateralPool } from "@/lib/markets";
import { cn } from "@/lib/utils";

/**
 * The transactions on a pool's positions, from every wallet, newest first,
 * read from the backend (FAR-71): collateral in and out, loans, repayments
 * and liquidations. The lenders' supplies and withdrawals are not here: they
 * belong to the market the pool borrows from, and a wallet's own are in its
 * Portfolio.
 *
 * The rows are the backend's copy of the chain's logs, up to a minute behind
 * the chain. When the copy cannot be read the section says so; it says "no
 * transactions" only for a pool the backend answered for.
 */
const explorer = chain.blockExplorers.default.url;

function Row({ row }: { row: PoolActivityRow }) {
  return (
    <tr className="text-[13px] text-foreground">
      <td className="px-5 py-3.5 sm:px-6">
        {/* The date is the way to the transaction: the column beside the action rail has no room for its hash. */}
        <a
          href={`${explorer}/tx/${row.transactionHash}`}
          target="_blank"
          rel="noreferrer"
          title={`Transaction ${row.transactionHash}`}
          className="focus-ring tnum inline-flex items-center gap-1 whitespace-nowrap rounded hover:text-brand-300"
        >
          {fmtTimestampUtc(row.at)}
          <ArrowUpRight className="size-3 text-brand-300" aria-hidden />
        </a>
      </td>
      <td className="px-3 py-3.5">
        {/* Warm, because a liquidation is a position being taken away. */}
        <span className={cn("whitespace-nowrap", row.kind === "liquidation" && "text-danger")}>
          {activityLabel(row)}
        </span>
        {row.tokenId && (
          <span className="mt-0.5 block whitespace-nowrap text-[12px] text-steel-500">
            Position <span className="font-mono">#{row.tokenId}</span>
          </span>
        )}
      </td>
      <td className="px-3 py-3.5">
        {row.amountUsdg === null ? (
          <span className="text-steel-500">{NO_FIGURE}</span>
        ) : (
          <span className="tnum flex items-center gap-2 whitespace-nowrap">
            <AssetMark asset="USDG" size={18} />
            {fmtUsdgFull(row.amountUsdg)} USDG
          </span>
        )}
      </td>
      <td className="px-5 py-3.5 sm:px-6">
        <a
          href={`${explorer}/address/${row.owner}`}
          target="_blank"
          rel="noreferrer"
          title={row.owner}
          className="focus-ring inline-flex items-center gap-2 whitespace-nowrap rounded hover:text-brand-300"
        >
          <AddressMark address={row.owner} />
          <span className="font-mono text-[12.5px]">{shortAddress(row.owner)}</span>
        </a>
      </td>
    </tr>
  );
}

export function PoolActivity({ pool }: { pool: CollateralPool }) {
  const [kind, setKind] = useState<PoolActivityFilter>("all");
  const history = usePoolActivity(pool.poolId, kind);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="text-[15px] font-semibold text-foreground">All transactions</h3>
        <SelectMenu
          label="Transaction type"
          variant="ghost"
          value={kind}
          options={POOL_ACTIVITY_FILTERS}
          onChange={setKind}
          icon={<ListFilter className="size-4" aria-hidden />}
        />
      </div>

      {history.status === "failed" ? (
        <div className="mt-3 flex flex-col items-center gap-4 rounded-[var(--radius-xl)] border border-border/70 px-5 py-9 text-center">
          <p className="max-w-[560px] text-[13px] leading-[20px] text-warn">
            {historyFailureMessage(history.error, "pool")}
          </p>
          <button type="button" onClick={history.retry} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Try again
          </button>
        </div>
      ) : (
        <div className="surface mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border/80 text-[12.5px] text-steel-400">
                <th scope="col" className="px-5 py-3.5 font-medium sm:px-6">
                  Date (UTC)
                </th>
                <th scope="col" className="px-3 py-3.5 font-medium">
                  Type
                </th>
                <th scope="col" className="px-3 py-3.5 font-medium">
                  Amount
                </th>
                <th scope="col" className="px-5 py-3.5 font-medium sm:px-6">
                  User
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {history.rows.map((row) => (
                <Row key={row.id} row={row} />
              ))}
              {history.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-[13px] text-steel-400 sm:px-6">
                    {history.status === "loading"
                      ? "Loading the pool's transactions…"
                      : kind === "all"
                        ? "No transactions in this pool yet."
                        : "No transactions of this type in this pool."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {history.status === "ready" && history.error !== null && (
        <p role="status" className="mt-3 px-1 text-[12.5px] leading-[19px] text-warn">
          The last read of this list failed, so it may be out of date or stop short.{" "}
          {historyFailureMessage(history.error, "pool")}
        </p>
      )}

      {history.status === "ready" && history.rows.length > 0 && (
        <div className="mt-4 flex justify-center">
          {history.hasMore ? (
            <button
              type="button"
              disabled={history.loadingMore}
              onClick={history.loadMore}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              {history.loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : (
            <p className="text-[12px] text-steel-500">No earlier transactions.</p>
          )}
        </div>
      )}
    </div>
  );
}
