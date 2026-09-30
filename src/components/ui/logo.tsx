import Image from "next/image";

import { cn } from "@/lib/utils";

/** The mark, straight from farmenta-logo.png, on the ground as it is: no light behind it. */
function LogoMark({
  size = 32,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src="/farmenta-logo.png"
        alt=""
        width={size}
        height={size}
        priority={priority}
        className="relative"
      />
    </span>
  );
}

/** Mark + name. The name is the display face, tightened and unshouted. */
export function Logo({
  size = 30,
  className,
  priority = false,
  showName = true,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  showName?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} priority={priority} />
      {showName && (
        <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-foreground">
          Farmenta
        </span>
      )}
    </span>
  );
}
