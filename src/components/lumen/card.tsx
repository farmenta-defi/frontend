import type { ReactNode } from "react";

/**
 * Square-cornered LŪMEN panel: hairline border, bracketed technical
 * title, muted body copy. `delay` staggers the entrance animation.
 */
export function LumenCard({
  title,
  delay = 0,
  className = "",
  children,
}: {
  title?: string;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`border border-white/15 bg-black/40 p-[20px] anim-fade-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title && (
        <span className="font-manrope text-white text-[13px] leading-[15.6px] whitespace-nowrap">
          [ {title} ]
        </span>
      )}
      <div className={`font-manrope text-white/50 text-[13px] leading-[18px] ${title ? "mt-[10px]" : ""}`}>
        {children}
      </div>
    </div>
  );
}
