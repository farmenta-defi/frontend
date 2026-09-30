import { cn } from "@/lib/utils";

/** Shared thresholds so every surface calls the same number the same thing. */
export const hfTone = (hf: number) => (hf >= 3 ? "ok" : hf >= 1.1 ? "warn" : "danger");
export const hfLabel = (hf: number) => (hf > 10 ? ">10" : hf.toFixed(2));

/**
 * Health factor gauge, 1.0 → 5.0 (anything above pins right).
 *
 * The scale runs cold-to-warm exactly as the logo does, read right to
 * left: cyan is a healthy loan, orange is a loan worth watching, red is
 * a loan a liquidator may take. No green anywhere: the palette has
 * none, and blue/orange/red also survives red-green colour blindness
 * better than the usual traffic light.
 */
export function HealthBar({ hf, className }: { hf: number; className?: string }) {
  const clamped = hf === Infinity ? 5 : Math.min(Math.max(hf, 1), 5);
  const pct = ((clamped - 1) / 4) * 100;

  return (
    <div className={cn("w-full", className)}>
      <div className="relative py-[5px]">
        <div
          className="relative h-[5px] w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Health factor"
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={clamped}
          aria-valuetext={hf === Infinity ? "Healthy, above 5" : hfLabel(hf)}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, var(--danger) 0%, var(--danger) 4%, var(--warn) 17%, var(--warn) 40%, var(--brand-500) 64%, var(--brand-400) 100%)",
            }}
          />
          {/* everything to the right of the marker is dimmed, so the lit
              part of the bar is the part the loan has actually earned */}
          <div
            className="absolute inset-y-0 right-0 bg-background/62 transition-[left] duration-300"
            style={{ left: `${pct}%` }}
          />
        </div>
        <span
          aria-hidden
          className="absolute top-0 block h-[15px] w-[2px] rounded-full bg-foreground transition-[left] duration-300"
          style={{ left: `calc(${pct}% - 1px)` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] leading-none">
        <span className="text-danger">1.0 · liquidation</span>
        <span className="text-steel-500">3.0</span>
        <span className="text-ok">safe</span>
      </div>
    </div>
  );
}
