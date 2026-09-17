/**
 * The reserved routing corridors, drawn.
 *
 * Nothing is ever placed in these rectangles - `npm run check` asserts it - so
 * what this overlay shows is the connected network the router paths through. Wide corridors are shallow (trunk) channels,
 * narrow ones are local.
 */
export default function Channels({ channels, theme }) {
  return (
    <g>
      {channels.map((c, i) => (
        <rect
          key={i}
          x={c.x} y={c.y} width={c.w} height={c.h}
          fill="url(#pat-channel)"
          stroke={theme.channelEdge}
          strokeWidth="0.6"
          strokeOpacity="0.55"
          vectorEffect="non-scaling-stroke"
          opacity={0.95}
        />
      ))}
    </g>
  );
}
