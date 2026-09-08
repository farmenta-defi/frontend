import { KeyRound, Sliders } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The two risks the architecture spec (§15, items 9 and 11) requires the
 * frontend itself to state, not only the contract README. They are
 * powers the protocol owner holds over a user's money, so they are shown
 * in the warm half of the palette and never collapsed behind a link.
 */
type Disclosure = {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  mitigation: string;
  tone: "danger" | "warn";
};

export const DISCLOSURES: readonly Disclosure[] = [
  {
    id: "upgrade-key",
    icon: KeyRound,
    title: "One key can replace the entire protocol",
    body: "The market is a UUPS proxy owned by a single EOA with no timelock. That key can swap the contract logic and move every deposited position NFT and USDG deposit in a single transaction. It is the largest risk in Farmenta, larger than any market risk on this page.",
    mitigation:
      "Accepted for an MVP holding no real TVL. A timelock on upgrades is required before the protocol takes real deposits.",
    tone: "danger",
  },
  {
    id: "lt-power",
    icon: Sliders,
    title: "The owner can make a healthy loan liquidatable",
    body: "Liquidation thresholds can be lowered per pool with no rate limit and no floor, and the change applies immediately to loans that already exist. A borrower who did nothing wrong can be liquidated and still pay the liquidator bonus.",
    mitigation:
      "This is the price of being able to react to a broken oracle or a rugged token. The only mitigation is legibility: any threshold ramp is scheduled on-chain and readable in advance, so the date your position falls is not private to the owner.",
    tone: "warn",
  },
] as const;

export function RiskDisclosures({
  className,
  heading = true,
}: {
  className?: string;
  heading?: boolean;
}) {
  return (
    <section className={className} aria-labelledby="owner-powers">
      {heading && (
        <div className="mb-5">
          <h2 id="owner-powers" className="font-display text-[20px] font-semibold text-foreground">
            What the protocol owner can do to you
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-[22px] text-steel-400">
            Two powers outrank every parameter on this page. Both are deliberate, both are
            recorded in the spec, and both are stated here rather than buried in the contract
            README.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {DISCLOSURES.map((d) => {
          const Icon = d.icon;
          const warm = d.tone === "danger";
          return (
            <article
              key={d.id}
              className={cn(
                "surface p-5",
                warm ? "border-danger/30" : "border-warn/30",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
                    warm
                      ? "border-danger/35 bg-danger/10 text-danger"
                      : "border-warn/35 bg-warn/10 text-warn",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <h3
                    className={cn(
                      "text-[15px] font-semibold",
                      warm ? "text-danger" : "text-warn",
                    )}
                  >
                    {d.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-[21px] text-steel-300">{d.body}</p>
                  <p className="mt-3 border-t border-border/70 pt-3 text-[13px] leading-[21px] text-steel-400">
                    {d.mitigation}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

    </section>
  );
}
