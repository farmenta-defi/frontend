/**
 * What the backend sends, field for field, and the check that an answer has
 * that shape. Nothing here is a figure to show yet: `./figures` and
 * `./activity` convert.
 *
 * The shape is the backend's (spec §13, routes in `src/markets/markets.controller.ts`
 * and `src/activity/activity.controller.ts` of the `backend` repo). An amount
 * is a decimal string of base units with the unit in the field's name, a
 * percentage is a string with two decimals, and `null` is a figure the backend
 * does not have.
 */

/** One reading of a market: the latest, or one step of its history. */
export type WireSnapshot = {
  market: string;
  tier: string;
  /** USDG base units. What lenders own: cash plus loans, less the reserves. */
  totalAssets: string;
  /** USDG base units. */
  totalBorrows: string;
  /** USDG base units. */
  reserves: string;
  utilizationBps: number;
  borrowAprBps: number;
  supplyApyBps: number;
  blockNumber: string;
  /** ISO 8601. */
  observedAt: string;
};

export type WireMarket = {
  tier: string;
  market: string;
  snapshot: WireSnapshot | null;
  history: WireSnapshot[];
};

/** A listed pool and the terms it lends on, as `GET /markets/:tier/pools` lists it. */
export type WireListedPool = {
  id: string;
  /** The five fields of the `PoolKey`. `null` for a pool created before the indexer's first block (FAR-82). */
  currency0: string | null;
  currency1: string | null;
  fee: number | null;
  tickSpacing: number | null;
  hooks: string | null;
  /** 1 is blue chip, 2 is meme. */
  tier: number;
  maxLtvBps: number;
  ltBps: number;
  /** `ltBps`, or what is left of it while a delisting ramp runs. */
  effectiveLtBps: number;
  liquidatorBonusBps: number;
  removeHaircutBps: number;
  debtCapUsdg: string;
  minPositionUsd: string;
  frozen: boolean;
};

/** One pool with its figures, as `GET /pools/:poolId` answers. */
export type WirePool = WireListedPool & {
  tierName: string;
  market: string;
  poolDebtUsdg: string;
  availableToBorrowUsdg: string;
  borrowAprPct: string | null;
  rate6hPct: string | null;
  history: WireSnapshot[];
};

/**
 * One row of a wallet's history, as `GET /activity/:address` sends it: one
 * log of a market. The fields below are on every row. The rest depend on
 * `category` and `kind`, and `./activity` reads them:
 * - `vault`, the lender's side: `kind` ("deposit", "withdraw", "transfer"),
 *   `assetsUsdg` (`null` for a transfer, which moves shares only), `shares`
 * - `loan`, the borrower's side: `kind`, `tokenId`, `owner`, and `amountUsdg`
 *   for "borrow" and "repay" only
 * - `liquidation`: `tokenId`, `full`, `repaidUsdg`, `badDebtUsdg`
 */
export type WireActivityRow = {
  category: string;
  market: string;
  blockNumber: string;
  logIndex: number;
  /** The block's, in seconds since the epoch. */
  timestamp: string;
  transactionHash: string;
  [field: string]: unknown;
};

/** One page of a wallet's history, newest first. */
export type WireActivity = {
  items: WireActivityRow[];
  /** `blockNumber:logIndex` of the last row, to ask for the rows after it. Sent on the last page too. */
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * One row of a pool's history, as `GET /pools/:poolId/activity` sends it: one
 * log of the pool's market about a position in that pool, from any wallet.
 * The route sends collateral in and out, loans, repayments and liquidations,
 * and nothing else (decided by the product owner, 29 Sep 2026): the lenders'
 * supplies and withdrawals belong to the market, not to a pool.
 *
 * Every row has every field. The ones that do not apply to its kind are
 * `null`: `amountUsdg` is for "borrow" and "repay" only, and `liquidator`,
 * `repaidUsdg`, `badDebtUsdg` and `full` for "liquidation" only.
 */
export type WirePoolActivityRow = {
  market: string;
  poolId: string;
  blockNumber: string;
  logIndex: number;
  /** The block's, in seconds since the epoch. */
  timestamp: string;
  transactionHash: string;
  /** "deposit", "withdraw", "borrow", "repay" or "liquidation". */
  kind: string;
  /** The position. */
  tokenId: string;
  /** The loan's depositor: whose collateral the position is. */
  owner: string;
  [field: string]: unknown;
};

/** One page of a pool's history, newest first. The cursor works as in `WireActivity`. */
export type WirePoolActivity = {
  items: WirePoolActivityRow[];
  nextCursor: string | null;
  hasMore: boolean;
};

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const orNull = <T>(is: (value: unknown) => value is T) => (value: unknown): value is T | null =>
  value === null || is(value);

const textOrNull = orNull(isText);
const numberOrNull = orNull(isNumber);

const isPoolId = (value: unknown): value is string => isText(value) && /^0x[0-9a-fA-F]{64}$/.test(value);

function isSnapshot(value: unknown): value is WireSnapshot {
  if (!isObject(value)) return false;
  return (
    isText(value.market) &&
    isText(value.tier) &&
    isText(value.totalAssets) &&
    isText(value.totalBorrows) &&
    isText(value.reserves) &&
    isNumber(value.utilizationBps) &&
    isNumber(value.borrowAprBps) &&
    isNumber(value.supplyApyBps) &&
    isText(value.blockNumber) &&
    isText(value.observedAt)
  );
}

const isHistory = (value: unknown): value is WireSnapshot[] => Array.isArray(value) && value.every(isSnapshot);

function isMarket(value: unknown): value is WireMarket {
  if (!isObject(value)) return false;
  return (
    isText(value.tier) &&
    isText(value.market) &&
    (value.snapshot === null || value.snapshot === undefined || isSnapshot(value.snapshot)) &&
    isHistory(value.history)
  );
}

function isListedPool(value: unknown): value is WireListedPool {
  if (!isObject(value)) return false;
  return (
    isPoolId(value.id) &&
    textOrNull(value.currency0) &&
    textOrNull(value.currency1) &&
    numberOrNull(value.fee) &&
    numberOrNull(value.tickSpacing) &&
    textOrNull(value.hooks) &&
    isNumber(value.tier) &&
    isNumber(value.maxLtvBps) &&
    isNumber(value.ltBps) &&
    isNumber(value.effectiveLtBps) &&
    isNumber(value.liquidatorBonusBps) &&
    isNumber(value.removeHaircutBps) &&
    isText(value.debtCapUsdg) &&
    isText(value.minPositionUsd) &&
    typeof value.frozen === "boolean"
  );
}

function isPool(value: unknown): value is WirePool {
  if (!isListedPool(value)) return false;
  const pool = value as Fields;
  return (
    isText(pool.tierName) &&
    isText(pool.market) &&
    isText(pool.poolDebtUsdg) &&
    isText(pool.availableToBorrowUsdg) &&
    textOrNull(pool.borrowAprPct) &&
    textOrNull(pool.rate6hPct) &&
    isHistory(pool.history)
  );
}

function isActivityRow(value: unknown): value is WireActivityRow {
  if (!isObject(value)) return false;
  return (
    isText(value.category) &&
    isText(value.market) &&
    isText(value.blockNumber) &&
    isNumber(value.logIndex) &&
    isText(value.timestamp) &&
    isText(value.transactionHash)
  );
}

function isActivity(value: unknown): value is WireActivity {
  if (!isObject(value)) return false;
  return (
    Array.isArray(value.items) &&
    value.items.every(isActivityRow) &&
    textOrNull(value.nextCursor) &&
    typeof value.hasMore === "boolean"
  );
}

function isPoolActivityRow(value: unknown): value is WirePoolActivityRow {
  if (!isObject(value)) return false;
  return (
    isText(value.market) &&
    isPoolId(value.poolId) &&
    isText(value.blockNumber) &&
    isNumber(value.logIndex) &&
    isText(value.timestamp) &&
    isText(value.transactionHash) &&
    isText(value.kind) &&
    isText(value.tokenId) &&
    isText(value.owner)
  );
}

function isPoolActivity(value: unknown): value is WirePoolActivity {
  if (!isObject(value)) return false;
  return (
    Array.isArray(value.items) &&
    value.items.every(isPoolActivityRow) &&
    textOrNull(value.nextCursor) &&
    typeof value.hasMore === "boolean"
  );
}

/** Each returns the answer typed, or `null` when it does not have the shape. */
export const readMarkets = (body: unknown): WireMarket[] | null =>
  Array.isArray(body) && body.every(isMarket)
    ? body.map((market) => ({ ...market, snapshot: market.snapshot ?? null }))
    : null;

export const readListedPools = (body: unknown): WireListedPool[] | null =>
  Array.isArray(body) && body.every(isListedPool) ? body : null;

export const readPool = (body: unknown): WirePool | null => (isPool(body) ? body : null);

export const readActivity = (body: unknown): WireActivity | null => (isActivity(body) ? body : null);

export const readPoolActivity = (body: unknown): WirePoolActivity | null => (isPoolActivity(body) ? body : null);
