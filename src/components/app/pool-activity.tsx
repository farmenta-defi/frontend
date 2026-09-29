"use client";

import { ArrowLeft, ArrowRight, Calendar, ListFilter } from "lucide-react";
import { useMemo, useState } from "react";

import { AddressMark } from "@/components/ui/address-mark";
import { AssetMark } from "@/components/ui/asset-mark";
import { SelectMenu } from "@/components/ui/select-menu";
import { shortAddress } from "@/lib/format";

/**
 * The table of a pool's transactions. No page renders it: the backend has no
 * route for a pool's activity yet (FAR-85), and the list this table used to
 * show was generated. It is given its rows and makes none up, so it comes
 * back on the pool's page as soon as there are rows to give it (FAR-71).
 *
 * The kinds below are the ones the generated list had. The route will send a
 * pool's own events, collateral, loans, repayments and liquidations, and not
 * the lenders' supplies and withdrawals, which belong to the market; the kinds
 * change with it.
 */
export const POOL_TX_TYPES = ["Supply", "Withdraw", "Borrow", "Repay"] as const;
export type PoolTxType = (typeof POOL_TX_TYPES)[number];

export type PoolTx = {
  id: string;
  /** Milliseconds since the epoch. */
  t: number;
  type: PoolTxType;
  /** USDG. */
  amount: number;
  user: `0x${string}`;
};

const two = (n: number) => String(n).padStart(2, "0");

/** "2026-09-27 15:34:25", always UTC so every reader sees the same instant. */
const fmtTimestampUtc = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
};

const PAGE_SIZE = 10;
const DAY_MS = 86_400_000;

const PERIODS = [
  { id: "all", label: "All time" },
  { id: "1d", label: "Last 24 hours" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
] as const;

type Period = (typeof PERIODS)[number]["id"];

const PERIOD_MS: Record<Period, number> = {
  all: Infinity,
  "1d": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
};

type TypeFilter = "all" | PoolTxType;

const TYPES: readonly { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  ...POOL_TX_TYPES.map((type) => ({ id: type, label: type })),
];

const amountLabel = (amount: number) =>
  amount.toLocaleString("en-US", { maximumFractionDigits: 3 });

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="focus-ring inline-flex size-9 items-center justify-center rounded-lg border border-border bg-white/[0.04] text-foreground transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:border-transparent disabled:text-steel-600 disabled:hover:bg-white/[0.04]"
    >
      {children}
    </button>
  );
}

/** The transactions it is given, newest first, a page at a time. */
export function PoolActivity({
  transactions,
  asOf,
}: {
  transactions: readonly PoolTx[];
  /** The instant the periods are counted back from: when the list was read. */
  asOf: number;
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [page, setPage] = useState(0);

  const rows = useMemo(
    () => transactions.filter((tx) => asOf - tx.t <= PERIOD_MS[period] && (type === "all" || tx.type === type)),
    [transactions, asOf, period, type],
  );

  const pages = Math.max(Math.ceil(rows.length / PAGE_SIZE), 1);
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="text-[15px] font-semibold text-foreground">All transactions</h3>
        <div className="flex items-center gap-1">
          <SelectMenu
            label="Period"
            variant="ghost"
            value={period}
            options={PERIODS}
            onChange={(next) => {
              setPeriod(next);
              setPage(0);
            }}
            icon={<Calendar className="size-4" aria-hidden />}
          />
          <SelectMenu
            label="Transaction type"
            variant="ghost"
            value={type}
            options={TYPES}
            onChange={(next) => {
              setType(next);
              setPage(0);
            }}
            icon={<ListFilter className="size-4" aria-hidden />}
          />
        </div>
      </div>

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
            {visible.map((tx) => (
              <tr key={tx.id} className="text-[13px] text-foreground">
                <td className="whitespace-nowrap px-5 py-3.5 sm:px-6">{fmtTimestampUtc(tx.t)}</td>
                <td className="px-3 py-3.5">{tx.type}</td>
                <td className="px-3 py-3.5">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <AssetMark asset="USDG" size={18} />
                    {amountLabel(tx.amount)} USDG
                  </span>
                </td>
                <td className="px-5 py-3.5 sm:px-6">
                  <span className="flex items-center gap-2" title={tx.user}>
                    <AddressMark address={tx.user} />
                    <span className="font-mono text-[12.5px]">{shortAddress(tx.user)}</span>
                  </span>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-[13px] text-steel-400 sm:px-6">
                  No transactions match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Transaction pages" className="mt-4 flex items-center justify-center gap-3">
        <PageButton
          label="Previous page"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          <ArrowLeft className="size-4" aria-hidden />
        </PageButton>
        <span
          aria-live="polite"
          className="tnum rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-medium text-foreground"
        >
          {current + 1}
          <span className="text-steel-500"> / {pages}</span>
        </span>
        <PageButton
          label="Next page"
          disabled={current >= pages - 1}
          onClick={() => setPage(current + 1)}
        >
          <ArrowRight className="size-4" aria-hidden />
        </PageButton>
      </nav>
    </div>
  );
}
