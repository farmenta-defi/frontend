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

export const fmtPct = (n: number) => `${n.toFixed(2)}%`;

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

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
