/**
 * Routed interconnect.
 *
 * Each polyline is a real dependency - file A imports file B - routed through
 * the corridors the floorplan reserved, so it turns only at right angles and
 * never crosses silicon. `npm run check` asserts both properties.
 *
 * Direction is carried by colour rather than by arrowheads, which at trace
 * width would be illegible and are not a thing that appears on a die anyway.
 */

/** A via is drawn where a trace changes layer, which on a real die is at a turn. */
function vias(paths) {
  const out = [];
  for (const p of paths) {
    for (let i = 1; i < p.pts.length - 1; i++) out.push(p.pts[i]);
  }
  return out;
}

const toPoints = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ');

export default function Traces({ paths, theme, scale }) {
  if (!paths.length) return null;

  // A trace has physical width, but capped in screen terms so it does not turn
  // into a ribbon at high magnification.
  const w = Math.min(1.2, 3.5 / scale);
  const showVias = scale > 0.25;
  const viaR = Math.min(1.0, 3 / scale);

  return (
    <g pointerEvents="none" fill="none" strokeLinejoin="round" strokeLinecap="round">
      {/* Halo: metal catches light, and it lifts the trace off a busy die. */}
      <g opacity="0.16">
        {paths.map((p) => (
          <polyline key={`h${p.key}`} points={toPoints(p.pts)} stroke={p.color} strokeWidth={w * 3} />
        ))}
      </g>

      {paths.map((p) => (
        <polyline key={p.key} points={toPoints(p.pts)} stroke={p.color} strokeWidth={w} opacity="0.95" />
      ))}

      {showVias && (
        <g fill={theme.via} stroke="none" opacity="0.85">
          {vias(paths).map(([x, y], i) => (
            <rect key={i} x={x - viaR} y={y - viaR} width={viaR * 2} height={viaR * 2} />
          ))}
        </g>
      )}
    </g>
  );
}
