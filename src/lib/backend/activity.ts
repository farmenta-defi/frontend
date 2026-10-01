import { isAddress, type Address, type Hex } from "viem";

import { usdgFieldToNumber } from "@/lib/units";

import type { WireActivity, WireActivityRow, WirePoolActivity, WirePoolActivityRow } from "./wire";

/**
 * A wallet's history, as rows to show (FAR-71). The backend sends every log
 * the indexer keeps for the wallet, in three categories, and sends them all:
 * what each one is called, which amount it carries and what a filter keeps is
 * decided here (spec §13, decision of 28 Sep 2026).
 *
 * A row is never dropped. A kind the app does not know is shown as "Other"
 * with its date and its transaction, because a history with a hole in it
 * reads as a transaction that did not happen.
 */
export type ActivityKind =
  /** The lender's side: USDG into a market, USDG out of it, and shares sent to another wallet. */
  | "supply"
  | "withdraw"
  | "share-transfer"
  /** The borrower's side, on one position. */
  | "collateral-deposit"
  | "collateral-withdraw"
  | "borrow"
  | "repay"
  | "liquidity-increase"
  | "liquidity-decrease"
  | "fees-collect"
  | "liquidation"
  /** A kind the backend sent and the app has no name for. */
  | "other";

export type ActivityRow = {
  /** `blockNumber:logIndex`: where the log is in the chain, which no two logs share. The form of the cursor. */
  id: string;
  /** The block's time, as milliseconds since the epoch. */
  at: number;
  kind: ActivityKind;
  /** The market the log is from. */
  market: Address;
  /**
   * USDG moved: supplied, withdrawn, borrowed, repaid, or repaid by the
   * liquidator. `null` for a kind that moves no USDG, and for an amount that
   * did not come as one.
   */
  amountUsdg: number | null;
  /** The position, for the borrower's side. `null` for the lender's. */
  tokenId: string | null;
  /** A liquidation only: whether the position was seized whole. `null` otherwise. */
  fullSeizure: boolean | null;
  /**
   * A change of liquidity only: whether the position's fees were paid out in
   * the same transaction. Set by `foldFees`, which takes their row away.
   */
  withFees?: boolean;
  transactionHash: Hex;
};

export type ActivityPage = {
  /** Newest first. */
  rows: ActivityRow[];
  /** What to ask the page after this one with, or `null` when this is the last. */
  next: string | null;
};

const VAULT_KINDS: Record<string, ActivityKind> = {
  deposit: "supply",
  withdraw: "withdraw",
  transfer: "share-transfer",
};

const LOAN_KINDS: Record<string, ActivityKind> = {
  deposit: "collateral-deposit",
  withdraw: "collateral-withdraw",
  borrow: "borrow",
  repay: "repay",
  increase_liquidity: "liquidity-increase",
  decrease_liquidity: "liquidity-decrease",
  collect_fees: "fees-collect",
};

/** "deposit" is a supply in the vault's rows and collateral in a loan's: the category decides. */
function kindOf(row: WireActivityRow): ActivityKind {
  if (row.category === "liquidation") return "liquidation";
  const kinds = row.category === "vault" ? VAULT_KINDS : row.category === "loan" ? LOAN_KINDS : null;
  return (kinds && typeof row.kind === "string" && Object.hasOwn(kinds, row.kind) && kinds[row.kind]) || "other";
}

/** The field that holds the USDG a kind moves, when it moves any. */
const AMOUNT_FIELD: Partial<Record<ActivityKind, string>> = {
  supply: "assetsUsdg",
  withdraw: "assetsUsdg",
  borrow: "amountUsdg",
  repay: "amountUsdg",
  liquidation: "repaidUsdg",
};

const isDigits = (text: string) => /^\d+$/.test(text);
const isHash = (text: string): text is Hex => /^0x[0-9a-fA-F]{64}$/.test(text);

/** `null` when the row cannot be placed in time or on the chain: that is an answer in another shape, not a row. */
function rowOf(row: WireActivityRow): ActivityRow | null {
  if (!isDigits(row.blockNumber) || !isDigits(row.timestamp)) return null;
  if (!Number.isInteger(row.logIndex) || row.logIndex < 0) return null;
  if (!isAddress(row.market, { strict: false }) || !isHash(row.transactionHash)) return null;

  const kind = kindOf(row);
  const amountField = AMOUNT_FIELD[kind];
  return {
    id: `${row.blockNumber}:${row.logIndex}`,
    at: Number(row.timestamp) * 1_000,
    kind,
    market: row.market,
    amountUsdg: amountField ? usdgFieldToNumber(row[amountField]) : null,
    tokenId: typeof row.tokenId === "string" && isDigits(row.tokenId) ? row.tokenId : null,
    fullSeizure: kind === "liquidation" && typeof row.full === "boolean" ? row.full : null,
    transactionHash: row.transactionHash,
  };
}

/** One page of the backend's answer as rows, or `null` when a row is not one. */
export function activityPageOf(activity: WireActivity): ActivityPage | null {
  const rows = activity.items.map(rowOf);
  if (!rows.every((row) => row !== null)) return null;
  // More rows and nothing to ask for them with: the list would end early and look complete.
  if (activity.hasMore && !activity.nextCursor) return null;
  // The backend sends a cursor on the last page too. `hasMore` says whether there is a next one.
  return { rows: rows as ActivityRow[], next: activity.hasMore ? activity.nextCursor : null };
}

/**
 * The pages read so far as one list. A row is listed once: when the chain
 * moves between two requests the backend's pages stay in step through the
 * cursor, and a log that came twice all the same is shown where it came first.
 */
export function historyRows<Row extends { id: string }>(pages: readonly { rows: Row[]; next?: string | null }[]): Row[] {
  const seen = new Set<string>();
  return pages
    .flatMap((page) => page.rows)
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}

/**
 * One transaction that changes a position's liquidity is one row (FAR-73).
 * The market pays the position's fees out with it and logs both, `CollectFees`
 * and then `LiquidityChanged`, so the backend sends two rows. The fees' row is
 * folded into the liquidity's, which then says that the fees came with it.
 * Fees collected on their own keep their row.
 *
 * Over every row read so far, not a page at a time: the two logs are next to
 * each other, and a page can end between them. Until the page with the fees'
 * row is read, the liquidity's row stands without the mention.
 */
export function foldFees<Row extends ActivityRow>(rows: readonly Row[]): Row[] {
  const isLiquidity = (row: Row) => row.kind === "liquidity-decrease" || row.kind === "liquidity-increase";
  const of = (row: Row) => `${row.transactionHash.toLowerCase()}:${row.tokenId}`;

  const changed = new Set(rows.filter(isLiquidity).map(of));
  const paid = new Set(rows.filter((row) => row.kind === "fees-collect" && changed.has(of(row))).map(of));
  return rows
    .filter((row) => !(row.kind === "fees-collect" && changed.has(of(row))))
    .map((row) => (isLiquidity(row) && paid.has(of(row)) ? { ...row, withFees: true } : row));
}

const LABELS: Record<ActivityKind, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  "share-transfer": "Transfer shares",
  "collateral-deposit": "Deposit collateral",
  "collateral-withdraw": "Withdraw collateral",
  borrow: "Borrow",
  repay: "Repay",
  "liquidity-increase": "Add liquidity",
  "liquidity-decrease": "Remove liquidity",
  "fees-collect": "Collect fees",
  liquidation: "Liquidation",
  other: "Other",
};

/** What a row is called. A liquidation says whether it took the whole position. */
export function activityLabel(row: Pick<ActivityRow, "kind" | "fullSeizure">): string {
  if (row.kind === "liquidation" && row.fullSeizure !== null) {
    return row.fullSeizure ? "Full liquidation" : "Partial liquidation";
  }
  return LABELS[row.kind];
}

/** What the list can be narrowed to. "Other" rows are under "All types" only. */
export const ACTIVITY_FILTERS = [
  { id: "all", label: "All types" },
  { id: "lending", label: "Supply and withdraw" },
  { id: "collateral", label: "Collateral" },
  { id: "loans", label: "Borrow and repay" },
  { id: "liquidity", label: "Liquidity and fees" },
  { id: "liquidations", label: "Liquidations" },
] as const;

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number]["id"];

const FILTER_KINDS: Record<Exclude<ActivityFilter, "all">, readonly ActivityKind[]> = {
  lending: ["supply", "withdraw", "share-transfer"],
  collateral: ["collateral-deposit", "collateral-withdraw"],
  loans: ["borrow", "repay"],
  liquidity: ["liquidity-increase", "liquidity-decrease", "fees-collect"],
  liquidations: ["liquidation"],
};

export const matchesFilter = (row: Pick<ActivityRow, "kind">, filter: ActivityFilter) =>
  filter === "all" || FILTER_KINDS[filter].includes(row.kind);

/* ------------------------------------------------------------------ */
/* A pool's history                                                     */
/* ------------------------------------------------------------------ */

/** A row of a pool's history: what happened to a position in the pool, and whose it is. */
export type PoolActivityRow = ActivityRow & {
  /** The loan's depositor: whose collateral the position is. For a liquidation, who was liquidated. */
  owner: Address;
};

export type PoolActivityPage = {
  /** Newest first. */
  rows: PoolActivityRow[];
  /** What to ask the page after this one with, or `null` when this is the last. */
  next: string | null;
};

/** The route names a liquidation in `kind`, where the wallet's route has a category for it. */
const POOL_KINDS: Record<string, ActivityKind> = { ...LOAN_KINDS, liquidation: "liquidation" };

function poolRowOf(row: WirePoolActivityRow): PoolActivityRow | null {
  if (!isDigits(row.blockNumber) || !isDigits(row.timestamp) || !isDigits(row.tokenId)) return null;
  if (!Number.isInteger(row.logIndex) || row.logIndex < 0) return null;
  if (!isAddress(row.market, { strict: false }) || !isAddress(row.owner, { strict: false })) return null;
  if (!isHash(row.transactionHash)) return null;

  const kind = (Object.hasOwn(POOL_KINDS, row.kind) && POOL_KINDS[row.kind]) || "other";
  const amountField = AMOUNT_FIELD[kind];
  return {
    id: `${row.blockNumber}:${row.logIndex}`,
    at: Number(row.timestamp) * 1_000,
    kind,
    market: row.market,
    amountUsdg: amountField ? usdgFieldToNumber(row[amountField]) : null,
    tokenId: row.tokenId,
    fullSeizure: kind === "liquidation" && typeof row.full === "boolean" ? row.full : null,
    transactionHash: row.transactionHash,
    owner: row.owner,
  };
}

/** One page of the backend's answer as rows, or `null` when a row is not one. */
export function poolActivityPageOf(activity: WirePoolActivity): PoolActivityPage | null {
  const rows = activity.items.map(poolRowOf);
  if (!rows.every((row) => row !== null)) return null;
  if (activity.hasMore && !activity.nextCursor) return null;
  return { rows: rows as PoolActivityRow[], next: activity.hasMore ? activity.nextCursor : null };
}

/**
 * What a pool's list can be narrowed to. Unlike the wallet's, this filter is
 * the backend's: the route takes one kind, under the name the chain's event
 * has, and the list is asked for again.
 */
export const POOL_ACTIVITY_FILTERS = [
  { id: "all", label: "All types" },
  { id: "deposit", label: "Deposit collateral" },
  { id: "withdraw", label: "Withdraw collateral" },
  { id: "borrow", label: "Borrow" },
  { id: "repay", label: "Repay" },
  { id: "liquidation", label: "Liquidation" },
] as const;

export type PoolActivityFilter = (typeof POOL_ACTIVITY_FILTERS)[number]["id"];
