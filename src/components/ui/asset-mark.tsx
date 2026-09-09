import { cn } from "@/lib/utils";

/**
 * Identity marks for the chains and tokens the market table lists, straight
 * from the official assets in `public/`.
 *
 * These are the one deliberate exception to the warm/cold rule in the design
 * system: they carry their owners' brand colours, including greens the palette
 * otherwise forbids. A logo is somebody else's identity, not our status
 * language, so each one only ever appears next to the asset's own name.
 * Nothing here is allowed to signal health or risk.
 *
 * Painted as a background rather than an <img> so `zoom` can crop a file's
 * empty margin against the box instead of spilling the art over its neighbours.
 */
export type AssetId =
  | "robinhood"
  | "arbitrum"
  | "ETH"
  | "WETH"
  | "cbBTC"
  | "NVDA"
  | "PONS"
  | "PENGU"
  | "AI"
  | "MEME"
  | "USDG"
  | "USDC"
  | "USDT";

/** The table's own ground, so a stacked mark can notch itself out of the one behind. */
const GROUND = "#0b0c0e";

type Mark = {
  src: string;
  name: string;
/** Mask to a circle: art that bleeds to its canvas edge, art we back with a
   * `disc`, and art already drawn as a disc, whose `notch` ring has to follow it. */
  round?: boolean;
  /** A disc painted under art that ships without one. */
  disc?: string;
  /**
   * Background size, when the file's own margin would otherwise render the art
   * small, or when art needs to sit inside a `disc`. Only ever large enough to
   * trim empty space: cropping a logo is worse than showing it small.
   * Re-measure with `svg.getBBox()` if a file is replaced.
   */
  zoom?: string;
};

const marks: Record<AssetId, Mark> = {
  // 56×56 canvas, art edge to edge: the lime field becomes the token disc.
  robinhood: { src: "/robinhood.svg", name: "Robinhood Chain", round: true },
  // 741×788 canvas holding a 370×417 mark dead centre, so half of it is margin.
  arbitrum: { src: "/arbitrum-logo.svg", name: "Arbitrum", zoom: "185%" },
  // The Ethereum diamond ships as black paths on nothing, invisible on this
  // ground, so it gets the light disc it is normally shown on.
  ETH: { src: "/ethereum-logo.svg", name: "Ether", round: true, disc: "#eef1f6", zoom: "62%" },
  WETH: { src: "/ethereum-logo.svg", name: "Wrapped Ether", round: true, disc: "#eef1f6", zoom: "62%" },
  // Already drawn as a disc on nothing, so the mask only has to follow its edge.
  cbBTC: { src: "/cbbtc-logo.png", name: "Coinbase Wrapped BTC", round: true },
  // The five below are square PNGs whose art runs to the canvas edge; the mask
  // is what turns each one into a token, and it takes their corners with it.
  NVDA: { src: "/nvda-logo.png", name: "Nvidia", round: true },
  PONS: { src: "/pons-logo.png", name: "PONS", round: true },
  PENGU: { src: "/pengu-logo.png", name: "Pudgy Penguins", round: true },
  AI: { src: "/ai-logo.png", name: "Artificial Inu", round: true },
  MEME: { src: "/meme-logo.png", name: "A Meme Coin", round: true },
  USDG: { src: "/usdg-logo.svg", name: "USDG", round: true },
  USDC: { src: "/usdc-logo.svg", name: "USD Coin", round: true },
  // A hexagon, not a disc, so it sits a little shorter than its neighbours.
  USDT: { src: "/usdt-logo.svg", name: "Tether" },
};

/** The ticker as written in pair strings, or null for anything unlisted. */
export function assetIdFor(symbol: string): AssetId | null {
  return symbol in marks ? (symbol as AssetId) : null;
}

/**
 * @param label Renders the name for assistive tech. Leave off when a visible
 *        label already sits beside the mark, so it is not read out twice.
 * @param notch Draws the ground between this mark and whatever it overlaps.
 */
export function AssetMark({
  asset,
  size = 22,
  label = false,
  notch = false,
  className,
}: {
  asset: AssetId;
  size?: number;
  label?: boolean;
  notch?: boolean;
  className?: string;
}) {
  const mark = marks[asset];
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <span
        aria-hidden
        className={cn("block bg-center bg-no-repeat", mark.round && "rounded-full")}
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${mark.src})`,
          backgroundSize: mark.zoom ?? "contain",
          backgroundColor: mark.disc,
          boxShadow: notch ? `0 0 0 2px ${GROUND}` : undefined,
        }}
      />
      {label && <span className="sr-only">{mark.name}</span>}
    </span>
  );
}

/**
 * The two sides of an LP position, stacked. The quote token sits in front
 * because it is the side the loan is denominated in, so "ETH/USDG" reads as
 * ETH behind USDG. Hovering parts them and names both.
 *
 * @param pair A "BASE/QUOTE" string.
 * @param hint Appended to the hover label, for context the tickers do not carry.
 */
export function AssetPair({
  pair,
  size = 22,
  hint,
  className,
}: {
  pair: string;
  size?: number;
  hint?: string;
  className?: string;
}) {
  const [base, quote] = pair.split("/");
  const baseId = assetIdFor(base);
  const quoteId = assetIdFor(quote);
  if (!baseId || !quoteId) return null;

  const names = [marks[baseId].name, marks[quoteId].name].join(" / ");
  return (
    <span className={cn("group/pair relative inline-flex shrink-0 items-center", className)}>
      <AssetMark
        asset={baseId}
        size={size}
        className="transition-transform duration-200 group-hover/pair:-translate-x-[2px]"
      />
      {/* A quarter: enough to read as a pair, not so much that the token
          behind loses its silhouette. */}
      <span
        className="inline-flex transition-transform duration-200 group-hover/pair:translate-x-[2px]"
        style={{ marginLeft: -Math.round(size / 4) }}
      >
        <AssetMark asset={quoteId} size={size} notch />
      </span>
      <span
        role="tooltip"
        // Above rather than below: the table clips its own overflow, and there
        // is always a header row overhead but not always a row underneath.
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden whitespace-nowrap rounded-lg border border-border bg-[#292a2c] px-2 py-1 text-[11px] font-normal text-foreground shadow-xl group-hover/pair:block"
      >
        {names}
        {hint && <span className="text-steel-400"> · {hint}</span>}
      </span>
    </span>
  );
}
