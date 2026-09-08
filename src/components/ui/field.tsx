"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Keep only digits and a single decimal point, typed or pasted. */
export const sanitizeAmount = (raw: string) => {
  let s = raw.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return s;
};

export const parseAmount = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Amount box with a suffix token and a MAX affordance inside the field. */
export function AmountInput({
  value,
  onChange,
  onMax,
  token = "USDG",
  disabled = false,
  invalid = false,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  onMax?: () => void;
  token?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-black/25 pr-2 transition-[border-color,box-shadow]",
        invalid
          ? "border-danger/60 focus-within:shadow-[0_0_0_3px_rgba(252,8,42,0.14)]"
          : "border-input focus-within:border-brand-400 focus-within:shadow-[0_0_0_3px_rgba(0,185,253,0.14)]",
        disabled && "opacity-45",
      )}
    >
      <input
        id={id}
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(e) => onChange(sanitizeAmount(e.target.value))}
        className="font-display tnum h-12 w-full min-w-0 bg-transparent px-4 text-[19px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-steel-600"
      />
      <span className="shrink-0 text-[13px] font-medium text-steel-400">{token}</span>
      {onMax && (
        <button
          type="button"
          onClick={onMax}
          disabled={disabled}
          className="focus-ring shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium tracking-wide text-brand-300 transition-colors hover:border-brand-400/60 hover:bg-brand-400/10"
        >
          MAX
        </button>
      )}
    </div>
  );
}

/** A label/value line in a summary list. */
export function InfoRow({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2.5", className)}>
      <span className="text-[13px] text-steel-400">{label}</span>
      <span className="tnum text-right text-[13px] font-medium text-foreground">{children}</span>
    </div>
  );
}

export function InfoList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y divide-border/70 border-y border-border/70", className)}>
      {children}
    </div>
  );
}
