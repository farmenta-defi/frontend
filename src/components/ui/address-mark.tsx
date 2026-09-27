import { cn } from "@/lib/utils";

/**
 * A disc that tells two addresses apart at a glance. It stays inside the cold
 * half of the palette: an address is an identity, and the warm half is kept
 * for risk.
 */
export function AddressMark({
  address,
  size = 20,
  className,
}: {
  address: string;
  size?: number;
  className?: string;
}) {
  const turn = parseInt(address.slice(2, 6), 16) % 360;
  const hue = 192 + (parseInt(address.slice(6, 10), 16) % 30);
  return (
    <span
      aria-hidden
      className={cn("block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        backgroundImage: `conic-gradient(from ${turn}deg, hsl(${hue} 90% 58%), hsl(${hue + 12} 80% 32%), hsl(${hue - 8} 45% 74%), hsl(${hue} 90% 58%))`,
      }}
    />
  );
}
