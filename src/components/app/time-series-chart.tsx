"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { SeriesPoint } from "@/lib/pool-history";

const HEIGHT = 248;
const PAD_TOP = 14;
/** Room under the plot for the date labels. */
const AXIS = 30;
/** More points than this is more than the plot has pixels for. */
const MAX_POINTS = 240;
const DAY_MS = 86_400_000;
const DAY_STEPS = [1, 2, 7, 14, 30];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Logo blue. Cyan is reserved for "healthy", and a balance is not a verdict. */
const SERIES = "var(--brand-500)";
const SURFACE = "var(--card)";

// Spelled out by hand rather than through Intl: the server and the browser
// can disagree on "Sep" versus "Sept", and a chart label is not worth a
// hydration mismatch.
const dayLabel = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const momentLabel = (t: number) => {
  const d = new Date(t);
  const clock = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `${dayLabel(t)} ${d.getUTCFullYear()}, ${clock} UTC`;
};

const niceStep = (rough: number) => {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const n = rough / magnitude;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * magnitude;
};

const thin = (points: SeriesPoint[]) => {
  if (points.length <= MAX_POINTS) return points;
  const every = Math.ceil(points.length / MAX_POINTS);
  // Counted from the end, so the latest point is always kept.
  return points.filter((_, i) => (points.length - 1 - i) % every === 0);
};

/**
 * One series over time, drawn from zero.
 *
 * The baseline is always zero because the fill under the line is read as an
 * amount: cropping the axis to make a quiet month look dramatic would turn a
 * 5% move into a cliff.
 *
 * Pointing anywhere in the plot reads out the nearest sample, and so do the
 * arrow keys once the chart has focus.
 */
export function TimeSeriesChart({
  points: allPoints,
  label,
  formatValue,
  formatTick,
  average,
}: {
  points: SeriesPoint[];
  /** What the series measures, for assistive tech and the readout. */
  label: string;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  /** Draws a reference line at this value. */
  average?: { value: number; label: string };
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId();

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(Math.round(entry.contentRect.width), 240));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const points = useMemo(() => thin(allPoints), [allPoints]);
  const last = points.length - 1;
  const active = activeIndex === null ? null : Math.min(activeIndex, last);

  const plotWidth = width;
  const plotBottom = HEIGHT - AXIS;
  const plotHeight = plotBottom - PAD_TOP;

  const { top, ticks } = useMemo(() => {
    const peak = Math.max(...points.map((point) => point.v), average?.value ?? 0);
    const step = niceStep(peak / 4);
    const ceiling = step * Math.ceil((peak * 1.04) / step);
    return {
      top: ceiling,
      ticks: Array.from({ length: Math.round(ceiling / step) }, (_, i) => step * (i + 1)),
    };
  }, [points, average?.value]);

  const start = points[0].t;
  const span = points[last].t - start || 1;
  const x = (t: number) => ((t - start) / span) * plotWidth;
  const y = (v: number) => plotBottom - (v / top) * plotHeight;

  const line = points
    .map((point, i) => `${i ? "L" : "M"}${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`)
    .join("");
  const area = `${line}L${plotWidth},${plotBottom}L0,${plotBottom}Z`;

  const dateTicks = useMemo(() => {
    const wanted = Math.min(Math.max(Math.floor(plotWidth / 84), 2), 7);
    const days = span / DAY_MS;
    const end = start + span;
    const found: number[] = [];

    // Past a few months a reader counts in months, so the ticks land on the 1st.
    if (days > 120) {
      const every = Math.ceil(days / 30.4 / wanted);
      const from = new Date(start);
      let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1);
      while (t <= end) {
        found.push(t);
        const at = new Date(t);
        t = Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + every, 1);
      }
      return found;
    }

    // Counted back from the latest day, so the most recent date is always named.
    const every = DAY_STEPS.find((step) => days / step <= wanted + 0.5) ?? 30;
    for (let t = Math.floor(end / DAY_MS) * DAY_MS; t >= start; t -= every * DAY_MS) found.push(t);
    return found;
  }, [plotWidth, span, start]);

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    setActiveIndex(Math.round(ratio * last));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = active ?? last;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(from - 1, 0)
        : event.key === "ArrowRight"
          ? Math.min(from + 1, last)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (event.key === "Escape") setActiveIndex(null);
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
  };

  const first = points[0];
  const latest = points[last];
  const summary = `${label}, ${dayLabel(first.t)} to ${dayLabel(latest.t)}. Started at ${formatValue(first.v)}, now ${formatValue(latest.v)}. Use the arrow keys to read each point.`;

  const focus = active === null ? null : points[active];
  const focusX = focus ? x(focus.t) : 0;

  return (
    <div
      ref={frame}
      role="group"
      tabIndex={0}
      aria-label={summary}
      onKeyDown={onKeyDown}
      onBlur={() => setActiveIndex(null)}
      className="focus-ring relative overflow-hidden rounded-xl"
      style={{ height: HEIGHT }}
    >
      <svg width={width} height={HEIGHT} aria-hidden className="block">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.2} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0.03} />
          </linearGradient>
        </defs>

        <rect width={width} height={plotBottom} rx={12} fill="rgba(148, 178, 214, 0.045)" />

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={0}
              x2={width}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgba(148, 178, 214, 0.1)"
              strokeWidth={1}
            />
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={SERIES}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Drawn after the series and haloed in the surface colour, so a line
            passing behind a label never strikes through it. */}
        {ticks.map((tick) => (
          <text
            key={tick}
            x={width - 12}
            y={y(tick) + 15}
            textAnchor="end"
            stroke={SURFACE}
            strokeWidth={3}
            strokeOpacity={0.6}
            strokeLinejoin="round"
            paintOrder="stroke"
            className="tnum fill-steel-300 text-[11px]"
          >
            {formatTick(tick)}
          </text>
        ))}

        {average && (
          <line
            x1={0}
            x2={plotWidth}
            y1={y(average.value)}
            y2={y(average.value)}
            stroke="var(--steel-300)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        )}

        {dateTicks.map((t) => {
          const at = x(t);
          // A label centred this close to an edge would be cut off by it, so it
          // hangs off its tick towards the middle instead.
          const anchor = at < 26 ? "start" : at > plotWidth - 26 ? "end" : "middle";
          return (
            <g key={t}>
              <line
                x1={at}
                x2={at}
                y1={plotBottom}
                y2={plotBottom + 5}
                stroke="rgba(148, 178, 214, 0.28)"
                strokeWidth={1}
              />
              <text
                x={at}
                y={plotBottom + 21}
                textAnchor={anchor}
                className="tnum fill-steel-400 text-[11px]"
              >
                {dayLabel(t)}
              </text>
            </g>
          );
        })}

        {focus && (
          <g pointerEvents="none">
            <line
              x1={focusX}
              x2={focusX}
              y1={PAD_TOP}
              y2={plotBottom}
              stroke="rgba(233, 239, 248, 0.32)"
              strokeWidth={1}
            />
            <circle cx={focusX} cy={y(focus.v)} r={5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}

        <rect
          width={plotWidth}
          height={plotBottom}
          fill="transparent"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setActiveIndex(null)}
        />
      </svg>

      {average && (
        <span
          className="tnum pointer-events-none absolute left-3 whitespace-nowrap rounded-full border border-border bg-popover px-2.5 py-1 text-[11px] font-medium text-foreground"
          style={{ top: y(average.value) - 34 }}
        >
          {average.label}
        </span>
      )}

      {focus && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-xl"
          style={{
            left: Math.min(Math.max(focusX, 78), Math.max(plotWidth - 78, 78)),
            // Above the point when there is room, below it when there is not,
            // so the readout never sits on the sample it is reading out.
            top: y(focus.v) > 76 ? y(focus.v) - 64 : y(focus.v) + 14,
            transform: "translateX(-50%)",
          }}
        >
          <p className="tnum text-[13px] font-semibold text-foreground">{formatValue(focus.v)}</p>
          <p className="tnum mt-0.5 text-[11px] text-steel-400">{momentLabel(focus.t)}</p>
        </div>
      )}
    </div>
  );
}
