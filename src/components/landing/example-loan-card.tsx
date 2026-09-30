"use client";

import { useState } from "react";

import { Badge, Dot } from "@/components/ui/badge";
import { HealthBar, hfLabel, hfTone } from "@/components/ui/health-bar";
import { fmtUsd, fmtUsdg } from "@/lib/format";
import { RISK_PARAMS } from "@/lib/risk-params";
import { cn } from "@/lib/utils";

const BC = RISK_PARAMS["blue-chip"];

/** Starting position, and the range each slider may explore. */
const START_VALUE = 2_400;
const VALUE_MIN = 600;
const VALUE_MAX = 4_000;
/** Max borrow is 65% LTV of the starting position, and stays fixed while
 *  the value slider moves: a loan already taken does not shrink when the
 *  price does. That is exactly how a position falls under water. */
const DEBT_MAX = Math.round(START_VALUE * BC.maxLtv);
const START_DEBT = 500;

const toneText = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
} as const;

const toneBadge = { ok: "ok", warn: "warn", danger: "danger" } as const;

function Slider({
  label,
  ariaLabel,
  valueText,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  valueText: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="range-brand mt-2"
      aria-label={ariaLabel}
      aria-valuetext={valueText}
      title={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ["--fill" as string]: `${fill}%` }}
    />
  );
}

/**
 * A worked example the reader can move. Both numbers are draggable and
 * the health factor answers live, so the hero teaches the mechanic
 * instead of describing it: borrow more and the gauge walks left, or
 * drop the position value and watch a healthy loan become liquidatable.
 */
export function ExampleLoanCard() {
  const [value, setValue] = useState(START_VALUE);
  const [debt, setDebt] = useState(START_DEBT);

  const hf = debt > 0 ? (value * BC.liqThreshold) / debt : Infinity;
  const tone = hfTone(hf) as keyof typeof toneText;
  const liquidatable = hf < 1;
  const status = liquidatable ? "Liquidatable" : tone === "ok" ? "Comfortable" : "Watch it";
  /** Position value at which this debt hits HF 1.0. */
  const liqValue = debt > 0 ? debt / BC.liqThreshold : 0;

  return (
    <div className="surface pop w-full max-w-sm p-5" style={{ animationDelay: "420ms" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="label-xs">Collateral</p>
          <p className="font-display mt-1 text-[16px] font-semibold text-foreground">
            ETH / USDG <span className="font-mono text-[12px] text-steel-500">#123</span>
          </p>
        </div>
        <Badge tone="ok">
          <Dot tone="ok" pulse />
          In range
        </Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-1">
        <div>
          <p className="label-xs">Position value</p>
          <p className="font-display tnum mt-1.5 text-[22px] font-semibold text-foreground">
            {fmtUsd(value)}
          </p>
          <Slider
            label="Position value"
            ariaLabel="Position value in US dollars"
            valueText={fmtUsd(value)}
            value={value}
            min={VALUE_MIN}
            max={VALUE_MAX}
            step={20}
            onChange={setValue}
          />
        </div>
        <div>
          <p className="label-xs">Borrowed</p>
          <p className="font-display tnum mt-1.5 text-[22px] font-semibold text-brand-300">
            {fmtUsdg(debt)} <span className="text-[13px] font-medium text-steel-400">USDG</span>
          </p>
          <Slider
            label="Borrowed"
            ariaLabel="Amount borrowed in USDG"
            valueText={`${fmtUsdg(debt)} USDG`}
            value={debt}
            min={0}
            max={DEBT_MAX}
            step={20}
            onChange={setDebt}
          />
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-[16px] text-steel-500">
        Drag either number to see how the health factor answers.
      </p>

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-steel-400">Health factor</span>
          <span className="flex items-baseline gap-2.5">
            <Badge tone={toneBadge[tone]}>{status}</Badge>
            <span
              className={cn("font-display tnum text-[18px] font-semibold", toneText[tone])}
            >
              {hfLabel(hf)}
            </span>
          </span>
        </div>
        <HealthBar hf={hf} className="mt-3" />
      </div>

      <p className="mt-4 text-[12px] leading-[18px] text-steel-500">
        {liquidatable ? (
          <>
            Below 1.0 anyone may repay part of this debt and take a slice of the position, plus a{" "}
            {Math.round(BC.liquidatorBonus * 100)}% bonus.
          </>
        ) : debt > 0 ? (
          <>
            Fees keep accruing while the position is held as collateral. Liquidation starts if the
            position falls to {fmtUsd(liqValue)}.
          </>
        ) : (
          <>
            With nothing borrowed there is no liquidation risk at all. The position simply sits in
            custody and keeps earning its fees.
          </>
        )}
      </p>
    </div>
  );
}
