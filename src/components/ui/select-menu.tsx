"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SelectOption<T extends string = string> = {
  id: T;
  label: string;
  /** Drawn before the label inside the list: a chain or token mark. */
  mark?: ReactNode;
  /** Listed so a reader can see it is coming, but not selectable. */
  disabled?: boolean;
};

/**
 * A one-of-many picker for lists too long to lay out as a segmented row.
 * `boxed` sits beside segmented controls; `ghost` sits in a table header,
 * where a second box would compete with the table's own edge.
 */
export function SelectMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
  variant = "boxed",
  align = "right",
  className,
}: {
  /** Names the control for assistive tech; never rendered. */
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (next: T) => void;
  icon?: ReactNode;
  variant?: "boxed" | "ghost";
  /** Which edge of the button the list hangs from. */
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((option) => option.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${current?.label ?? ""}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "focus-ring inline-flex h-[38px] items-center gap-2 whitespace-nowrap rounded-xl text-[13px] font-medium text-foreground transition-colors",
          variant === "boxed"
            ? "border border-border bg-white/[0.04] px-3.5 hover:bg-white/[0.07]"
            : "px-2.5 text-steel-300 hover:bg-white/[0.05] hover:text-foreground",
        )}
      >
        {icon}
        {current?.label}
        {variant === "boxed" && (
          <ChevronDown
            className={cn("size-4 text-steel-400 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className={cn(
            "absolute top-[44px] z-30 min-w-40 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-2xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {options.map((option) => {
            const selected = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={cn(
                  "focus-ring flex w-full items-center justify-between gap-4 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:text-steel-600 disabled:hover:bg-transparent",
                  selected ? "text-foreground" : "text-steel-300",
                )}
              >
                <span className={cn("flex items-center gap-2", option.disabled && "[&>:first-child]:opacity-40")}>
                  {option.mark}
                  {option.label}
                </span>
                {selected && <Check className="size-4 text-brand-300" strokeWidth={2.5} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
