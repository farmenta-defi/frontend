import { formatUnits, maxUint256, parseUnits } from "viem";

/**
 * Units, in one place for the on-chain actions (FAR-72) and the backend data
 * layer (FAR-80), so an amount is never converted by two sets of helpers.
 *
 * Three scales cross the app, and none of them is a JavaScript number until
 * it is about to be shown:
 * - USDG amounts, 6 decimals (`debtOf`, `maxBorrow`, balances, allowances)
 * - USD values and health factors, scaled 1e18 (`positionValue`, `healthFactor`)
 * - basis points (`maxLtvBps`, `ltBps`)
 *
 * The backend sends the same three as text (spec §13): an amount is a decimal
 * string of a whole number of base units, a percentage is a string with two
 * decimals, and `null` is "no figure yet", which is never turned into a zero.
 */
export const USDG_DECIMALS = 6;
export const WAD_DECIMALS = 18;

/** `borrow` refuses to leave a loan owing less than this (spec §6.2, `BorrowBelowMinimum`). */
export const MIN_DEBT_USDG = 10_000_000n;

/**
 * What a user typed, as USDG base units. `null` when it is not an amount:
 * empty, not a number, or finer than the token can hold. A seventh decimal is
 * refused rather than rounded, because rounding changes what gets signed.
 */
export function parseUsdg(input: string): bigint | null {
  const text = input.trim().replace(/,/g, "");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  if ((text.split(".")[1] ?? "").length > USDG_DECIMALS) return null;
  return parseUnits(text, USDG_DECIMALS);
}

/** USDG base units as the exact decimal string, for an input field ("1250.5"). */
export const formatUsdg = (amount: bigint) => formatUnits(amount, USDG_DECIMALS);

/** USDG base units as a number, for display only. Never feed it back into a transaction. */
export const usdgToNumber = (amount: bigint) => Number(formatUnits(amount, USDG_DECIMALS));

/** A 1e18-scaled USD value as a number, for display only. */
export const wadToNumber = (value: bigint) => Number(formatUnits(value, WAD_DECIMALS));

/** Basis points as a fraction: 6500 is 0.65. */
export const bpsToFraction = (bps: number | bigint) => Number(bps) / 10_000;

/**
 * A health factor from `MarketLens`, as a number. A loan with no debt reports
 * `type(uint256).max`, which is "cannot be liquidated", not a 78-digit figure.
 */
export const healthFactorToNumber = (healthFactor: bigint) =>
  healthFactor === maxUint256 ? Infinity : wadToNumber(healthFactor);

/**
 * A whole number of base units as the backend writes it: digits and nothing
 * else. `null` for anything that is not one, a sign and a decimal point
 * included, so a field that changed shape is not shown as a figure.
 */
export function parseBaseUnits(text: unknown): bigint | null {
  return typeof text === "string" && /^\d+$/.test(text) ? BigInt(text) : null;
}

/** A backend `…Usdg` field as USDG, for display only. `null` stays `null`. */
export function usdgFieldToNumber(text: unknown): number | null {
  const amount = parseBaseUnits(text);
  return amount === null ? null : usdgToNumber(amount);
}

/** A backend `…Usd` field (1e18) as dollars, for display only. `null` stays `null`. */
export function usdFieldToNumber(text: unknown): number | null {
  const value = parseBaseUnits(text);
  return value === null ? null : wadToNumber(value);
}

/** A backend `…Pct` field, "6.10", as 6.1. `null` for anything that is not a percentage with two decimals. */
export function pctFieldToNumber(text: unknown): number | null {
  return typeof text === "string" && /^\d+\.\d{2}$/.test(text) ? Number(text) : null;
}

/** Basis points as a percentage: 6500 is 65. `null` for anything that is not a whole, non-negative number. */
export function bpsFieldToPct(bps: unknown): number | null {
  return typeof bps === "number" && Number.isInteger(bps) && bps >= 0 ? bps / 100 : null;
}
