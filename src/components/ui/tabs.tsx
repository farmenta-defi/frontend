"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Sibling views of one subject, one on screen at a time.
 *
 * Every panel is rendered and handed in whole, so a panel built on the server
 * stays on the server; this component only decides which one is visible.
 */
export function Tabs<T extends string>({
  label,
  tabs,
}: {
  /** Names the tab row for assistive tech; never rendered. */
  label: string;
  tabs: readonly { id: T; label: string; panel: ReactNode }[];
}) {
  const [active, setActive] = useState<T>(tabs[0].id);
  const buttons = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const prefix = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length].id;
    setActive(next);
    buttons.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-7 border-b border-border/70"
      >
        {tabs.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`${prefix}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${prefix}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                "focus-ring -mb-px rounded-t border-b-2 pb-3 text-[17px] font-semibold transition-colors",
                selected
                  ? "border-brand-400 text-foreground"
                  : "border-transparent text-steel-500 hover:text-steel-300",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${prefix}-panel-${tab.id}`}
          aria-labelledby={`${prefix}-tab-${tab.id}`}
          hidden={active !== tab.id}
          className="pt-5"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
