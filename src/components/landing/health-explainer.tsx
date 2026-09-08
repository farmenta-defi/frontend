import { HealthBar } from "@/components/ui/health-bar";

/**
 * The palette doing work: the same cold-to-warm run as the logo, used to
 * explain the one number a borrower has to keep an eye on.
 */
const BANDS = [
  {
    range: "HF ≥ 3.0",
    tone: "text-ok",
    label: "Comfortable",
    body: "Collateral is worth at least three times what liquidation would require. Normal price moves do not threaten the loan.",
  },
  {
    range: "1.1 – 3.0",
    tone: "text-warn",
    label: "Watch it",
    body: "Still healthy, but a sharp move in the risky token, or the position drifting out of range, can push it down quickly.",
  },
  {
    range: "HF < 1.0",
    tone: "text-danger",
    label: "Liquidatable",
    body: "Anyone may repay part of the debt and take a slice of the position plus a bonus: 5% on blue chip, 10% on meme.",
  },
] as const;

export function HealthExplainer() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
      <div className="surface overflow-hidden">
        <div className="grid gap-10 p-6 sm:p-9 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="label-xs">The one number</p>
            <h2 className="font-display mt-3 text-[26px] font-semibold leading-tight text-foreground sm:text-[32px]">
              Health factor, and nothing else
            </h2>
            <p className="mt-4 text-[15px] leading-[24px] text-steel-400">
              Every risk in the protocol resolves into a single figure. It is computed from the
              position&rsquo;s oracle value, the market&rsquo;s liquidation threshold, and what you owe, and the colour it is
              printed in never changes meaning across this site.
            </p>

            <div className="mt-7 rounded-xl border border-border bg-black/25 p-5">
              <p className="font-mono text-[13px] leading-[22px] text-steel-300">
                HF = position value × LT ÷ debt
              </p>
              <p className="mt-3 border-t border-border/70 pt-3 font-mono text-[13px] leading-[22px] text-steel-400">
                $2,400 × 0.75 ÷ 1,000 = <span className="text-warn">1.80</span>
              </p>
            </div>

            <div className="mt-7">
              <HealthBar hf={1.8} />
            </div>
          </div>

          <ul className="space-y-4 self-center">
            {BANDS.map((b) => (
              <li key={b.range} className="rounded-xl border border-border bg-white/[0.02] p-5">
                <div className="flex items-baseline gap-3">
                  <span className={`font-display tnum text-[15px] font-semibold ${b.tone}`}>
                    {b.range}
                  </span>
                  <span className="text-[13px] font-medium text-foreground">{b.label}</span>
                </div>
                <p className="mt-2 text-[13px] leading-[21px] text-steel-400">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
