"use client";

import { ArrowUpRight, ListFilter } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Address } from "viem";

import { AssetMark } from "@/components/ui/asset-mark";
import { buttonClasses } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import {
  ACTIVITY_FILTERS,
  activityLabel,
  matchesFilter,
  type ActivityFilter,
  type ActivityRow,
} from "@/lib/backend/activity";
import { historyFailureMessage } from "@/lib/backend/client";
import { useWalletActivity } from "@/lib/backend/hooks";
import { chain } from "@/lib/chain";
import { deployment, tierOfMarket } from "@/lib/deployment";
import { fmtTimestampUtc, fmtUsdgFull, NO_FIGURE, shortAddress, shortHash } from "@/lib/format";
import { MARKETS } from "@/lib/markets";
import { cn } from "@/lib/utils";

/**
 * The wallet's transactions in Farmenta, newest first, read from the backend
 * (FAR-71): what it supplied and withdrew as a lender, and what happened to
 * the positions it borrowed against.
 *
 * The rows are the backend's copy of the chain's logs, a few seconds behind
 * the chain. When the copy cannot be read the tab says so and points at the
 * block explorer; it never says "no transactions" for a history it did not get.
 */
const explorer = chain.blockExplorers.default.url;

function MarketName({ market }: { market: Address }) {
  const tier = tierOfMarket(deployment, market);
  const name = tier && MARKETS.find((item) => item.id === tier)?.name;
  // A market this build has no manifest entry for is named by its address, not guessed.
  if (!name) {
    return (
      <span className="font-mono text-[12.5px]" title={market}>
        {shortAddress(market)}
      </span>
    );
  }
  return <>{name}</>;
}

function Row({ row }: { row: ActivityRow }) {
  return (
    <tr className="text-[13px] text-foreground">
      <td className="tnum whitespace-nowrap px-5 py-3.5 sm:px-6">{fmtTimestampUtc(row.at)}</td>
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
      <td className="whitespace-nowrap px-3 py-3.5">
        <MarketName market={row.market} />
      </td>
      <td className="px-5 py-3.5 sm:px-6">
        <a
          href={`${explorer}/tx/${row.transactionHash}`}
          target="_blank"
          rel="noreferrer"
          title={row.transactionHash}
          className="focus-ring inline-flex items-center gap-1 whitespace-nowrap rounded font-mono text-[12.5px] text-brand-300 hover:text-brand-400"
        >
          {shortHash(row.transactionHash)}
          <ArrowUpRight className="size-3" aria-hidden />
        </a>
      </td>
    </tr>
  );
}

/** `empty` is what to show for a wallet the backend has no transaction of. */
export function WalletActivity({ account, empty }: { account: Address; empty: ReactNode }) {
  const history = useWalletActivity(account);
  const [filter, setFilter] = useState<ActivityFilter>("all");

  if (history.status === "loading") {
    return <p className="px-1 py-6 text-[13px] text-steel-500">Loading your transactions…</p>;
  }

  if (history.status === "failed") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[var(--radius-xl)] border border-border/70 px-5 py-9 text-center">
        <p className="max-w-[560px] text-[13px] leading-[20px] text-warn">{historyFailureMessage(history.error)}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={history.retry} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Try again
          </button>
          <a
            href={`${explorer}/address/${account}`}
            target="_blank"
            rel="noreferrer"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Open the block explorer
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    );
  }

  if (history.rows.length === 0 && !history.hasMore) return <>{empty}</>;

  const visible = history.rows.filter((row) => matchesFilter(row, filter));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-1">
        <SelectMenu
          label="Transaction type"
          variant="ghost"
          value={filter}
          options={ACTIVITY_FILTERS}
          onChange={setFilter}
          icon={<ListFilter className="size-4" aria-hidden />}
        />
      </div>

      <div className="surface mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
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
              <th scope="col" className="px-3 py-3.5 font-medium">
                Market
              </th>
              <th scope="col" className="px-5 py-3.5 font-medium sm:px-6">
                Transaction
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {visible.map((row) => (
              <Row key={row.id} row={row} />
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-steel-400 sm:px-6">
                  {history.hasMore
                    ? "No transactions of this type among the ones loaded so far. Load more to look further back."
                    : "No transactions of this type."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {history.error !== null && (
        <p role="status" className="mt-3 px-1 text-[12.5px] leading-[19px] text-warn">
          The last read of your history failed, so the list may be out of date or stop short.{" "}
          {historyFailureMessage(history.error)}
        </p>
      )}

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
    </div>
  );
}
