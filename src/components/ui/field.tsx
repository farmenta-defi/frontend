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
