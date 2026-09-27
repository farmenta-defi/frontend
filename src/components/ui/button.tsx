import { cva } from "class-variance-authority";

/**
 * One button, four intents, as classes so a link can wear them too.
 * `primary` carries the logo's cold gradient; `danger` is the only place the
 * logo's red is allowed on a control, because on this site red means a
 * position is being taken away.
 */
export const buttonClasses = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,box-shadow,filter,transform] duration-200 focus-ring disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "brand-fill shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_28px_-12px_rgba(0,127,253,0.8)] hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_14px_34px_-12px_rgba(0,127,253,0.95)] active:translate-y-px",
        secondary:
          "border border-border bg-white/[0.03] text-foreground hover:border-brand-500/55 hover:bg-brand-500/10",
        ghost: "text-steel-300 hover:bg-white/[0.05] hover:text-foreground",
        danger:
          "border border-danger/35 bg-danger/10 text-danger hover:border-danger/60 hover:bg-danger/20",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-[15px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
