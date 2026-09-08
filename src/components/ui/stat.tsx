import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const toneClass = {
  default: "text-foreground",
  brand: "text-brand-300",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
} as const;

/** A labelled figure. Values are display-face and tabular so columns line up. */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  size = "md",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof toneClass;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const valueSize = {
    sm: "text-[17px]",
    md: "text-[22px]",
    lg: "text-[30px] sm:text-[34px]",
  }[size];

  return (
    <div className={className}>
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          "font-display tnum mt-1.5 font-semibold leading-tight",
          valueSize,
          toneClass[tone],
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[12px] leading-[16px] text-steel-500">{hint}</p>}
    </div>
  );
}
