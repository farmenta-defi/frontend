/**
 * How a figure is written, in one place, so the same amount never reads
 * "$1.24M" on one page and "$1,240,000" in the row next to it by accident.
 *
 * Everything here takes a number that is already in the unit it names; the
 * conversions from base units live in `./units`.
 */

/** What stands where a figure would, when there is none to show. Never a zero. */
export const NO_FIGURE = "—";

/** `format(value)`, or the dash when there is no figure. Zero is a figure. */
export const orDash = <T>(value: T | null | undefined, format: (value: T) => string) =>
  value === null || value === undefined ? NO_FIGURE : format(value);

export const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export const fmtUsdExact = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtUsdg = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/**
 * USDG to the last decimal it has, for a row of a history: what moved is
 * stated, not rounded. "0.100613", "1,250.5", "30".
 */
export const fmtUsdgFull = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

export const fmtPct = (n: number) => `${n.toFixed(2)}%`;

/**
 * An amount of a token, with the digits its size calls for: "604,610" of a
 * token worth cents, "1.3727" of a stock, "0.2437" of ETH, "0.00001234" of
 * what is left of a position.
 */
export const fmtAmount = (n: number) => {
  if (n === 0) return "0";
  if (n >= 1_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumSignificantDigits: 4 });
};

/**
 * "4.10" + "K", split so a headline can set the magnitude back a shade
 * instead of shouting it at the same weight as the digits. An amount under a
 * thousand carries no magnitude: an empty market reads "0.00", not "0.00K".
 */
export const compactParts = (n: number) => {
  if (n >= 1_000_000) return { figure: (n / 1_000_000).toFixed(2), unit: "M" };
  if (n >= 1_000) return { figure: (n / 1_000).toFixed(2), unit: "K" };
  return { figure: n.toFixed(2), unit: "" };
};

/** Axis density: "2K", "1.5M", "500". */
export const compactTick = (n: number) => {
  const trim = (value: number) => String(Number(value.toFixed(2)));
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return trim(n);
};

/** "312.40K USDG" / "1.24M USDG", the density the market table reads at. */
export const fmtCompactUsdg = (n: number) => {
  const { figure, unit } = compactParts(n);
  return `${figure}${unit} USDG`;
};

const two = (n: number) => String(n).padStart(2, "0");

/** "2026-09-27 15:34:25", always UTC so every reader sees the same instant. Takes milliseconds since the epoch. */
export const fmtTimestampUtc = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
};

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** A transaction hash at the length a table column takes: "0x45526648…7eb0". */
export const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-4)}`;
