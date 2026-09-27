"use client";

import { cn } from "@/lib/utils";

/**
 * A short row of mutually exclusive choices, for switching what a panel
 * shows. Same shape as the Borrow / Supply switch on the action rail.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** Names the group for assistive tech; never rendered. */
  label: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex rounded-xl bg-white/[0.04] p-1", className)}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "focus-ring rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              selected ? "bg-white/[0.1] text-foreground" : "text-steel-400 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
