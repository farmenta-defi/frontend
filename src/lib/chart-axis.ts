/**
 * The value axis of a chart drawn from zero: where it tops out, and where its
 * gridlines sit.
 *
 * A series that is zero throughout is a real one here: a market nobody has
 * supplied to yet. It gets an axis of its own rather than a division by zero,
 * and its line runs along the bottom.
 */
export type ValueAxis = {
  /** The value at the top of the plot. Never zero. */
  top: number;
  /** Where the gridlines are, bottom to top, the baseline left out. */
  ticks: number[];
};

const niceStep = (rough: number) => {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const n = rough / magnitude;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * magnitude;
};

/** The axis for a series that peaks at `peak`. Anything that is not a positive number counts as flat. */
export function valueAxis(peak: number): ValueAxis {
  // Nothing to scale to: one unit of headroom, and no gridline that would claim a level.
  if (!Number.isFinite(peak) || peak <= 0) return { top: 1, ticks: [] };

  const step = niceStep(peak / 4);
  const top = step * Math.ceil((peak * 1.04) / step);
  return { top, ticks: Array.from({ length: Math.round(top / step) }, (_, i) => step * (i + 1)) };
}
