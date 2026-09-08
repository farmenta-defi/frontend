import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The surface everything sits on: a navy panel lit from the top-left,
 * matching the way light falls across the logo's arcs.
 */
export function Card({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("surface overflow-hidden", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border/80 px-5 py-4 sm:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-1 text-[13px] text-steel-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("px-5 py-5 sm:px-6", className)}>{children}</div>;
}
