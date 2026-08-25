const verticalPositions = ["12.6%", "37.5%", "61.9%", "86.2%"];
const horizontalPositions = ["32.7%", "71.4%"];

/**
 * LŪMEN background grid: 4 vertical + 2 horizontal hairlines with plus
 * marks at all 8 intersections, animated in with the hero's wipe/scale
 * choreography. `fixed` pins it to the viewport (app pages); default is
 * absolute within the nearest positioned ancestor (hero section).
 * `crosses={false}` drops the plus marks (app pages keep hairlines only).
 */
export function GridLines({
  fixed = false,
  crosses = true,
}: {
  fixed?: boolean;
  crosses?: boolean;
}) {
  return (
    <div className={`${fixed ? "fixed" : "absolute"} inset-0 pointer-events-none`}>
      {verticalPositions.map((left, i) => (
        <div
          key={`v-${left}`}
          className="absolute top-0 h-full w-px bg-white/[0.04] anim-grid-v"
          style={{ left, animationDelay: `${600 + i * 100}ms` }}
        />
      ))}
      {horizontalPositions.map((top, i) => (
        <div
          key={`h-${top}`}
          className="absolute left-0 w-full h-px bg-white/[0.04] anim-grid-h"
          style={{ top, animationDelay: `${800 + i * 150}ms` }}
        />
      ))}
      {crosses &&
        horizontalPositions.map((top, hi) =>
          verticalPositions.map((left, vi) => (
          <div
            key={`plus-${top}-${left}`}
            className="absolute anim-scale-in"
            style={{ top, left, animationDelay: `${1000 + (hi * 4 + vi) * 80}ms` }}
          >
            <div className="absolute w-[10px] h-px bg-white/70 -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute w-px h-[10px] bg-white/70 -translate-x-1/2 -translate-y-1/2" />
          </div>
          )),
        )}
    </div>
  );
}
