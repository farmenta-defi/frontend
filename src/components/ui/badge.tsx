import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Status pills. The tone names are deliberately about *meaning*, not
 * colour, so the warm/cold rule cannot be broken by accident: nothing
 * neutral is ever allowed to render orange or red.
 */
const tones = {
  brand: "border-brand-400/35 bg-brand-400/10 text-brand-300",
  ok: "border-ok/35 bg-ok/10 text-ok",
  warn: "border-warn/35 bg-warn/10 text-warn",
  danger: "border-danger/40 bg-danger/12 text-danger",
  neutral: "border-border bg-white/[0.04] text-steel-300",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A 6px dot, for pills that report a live state. */
export function Dot({ tone = "ok", pulse = false }: { tone?: BadgeTone; pulse?: boolean }) {
  const fill = {
    brand: "bg-brand-400",
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    neutral: "bg-steel-400",
  }[tone];
  return <span className={cn("size-1.5 rounded-full", fill, pulse && "pulse-soft")} />;
}
