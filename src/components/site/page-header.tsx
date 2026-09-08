import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div>
        <h1 className="rise font-display text-[30px] font-semibold leading-tight text-foreground sm:text-[36px]">
          {title}
        </h1>
        <p
          className="rise mt-3 max-w-2xl text-[14px] leading-[22px] text-steel-400"
          style={{ animationDelay: "80ms" }}
        >
          {description}
        </p>
      </div>
      {actions && (
        <div className="rise" style={{ animationDelay: "160ms" }}>
          {actions}
        </div>
      )}
    </div>
  );
}
