import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The mark, straight from farmenta-logo.png. It is a dense, glossy
 * object, so at small sizes it gets a faint cold halo behind it;
 * otherwise it dissolves into the navy ground.
 */
export function LogoMark({
  size = 32,
  className,
  priority = false,
  halo = true,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  halo?: boolean;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {halo && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[-32%] rounded-full opacity-70 blur-lg"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(0,127,253,0.5), rgba(253,133,1,0.16) 55%, transparent 72%)",
          }}
        />
      )}
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

/**
 * A large, slowly turning copy of the mark used as page furniture. It is
 * blurred hard and masked to a soft circle so it reads as coloured light
 * spilling from the logo, not as a picture of the logo sitting behind
 * the text. Decorative only, hidden from assistive tech.
 */
export function VortexGlow({
  size = 720,
  className,
  opacity = 0.35,
  blur = 72,
}: {
  size?: number;
  className?: string;
  opacity?: number;
  blur?: number;
}) {
  const mask = "radial-gradient(closest-side, #000 24%, rgba(0,0,0,0.55) 58%, transparent 80%)";
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute select-none", className)}
      style={{ width: size, height: size, opacity }}
    >
      <div
        className="spin-slow size-full"
        style={{
          filter: `blur(${blur}px) saturate(1.15)`,
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      >
        <Image src="/farmenta-logo.png" alt="" width={size} height={size} className="size-full" />
      </div>
    </div>
  );
}
