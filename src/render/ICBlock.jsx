import { PIN_LENGTH } from '../layout/constants.js';
import { fitLabel } from './text.js';
import { variantOf } from './color.js';
import Package from './Package.jsx';
import { STRUCTURE, VARIANTS, FADE_AT, detailOpacity, mix } from './micro.jsx';

const PAD_LONG = 3.2;   // world-space ceiling, reached once you are zoomed out
const PAD_SHORT = 2.2;

/*
 * Contacts are screen-capped, like every other annotation here. Sized purely
 * in world units they grow with the magnification, so a 3um pad turned into a
 * 26px rounded slab at 8x - by far the loudest thing on a die that is
 * otherwise all texture. A contact should stay a contact at every zoom.
 */
const PAD_PX = 4.5;
const LEAD_PX = 7;
const LEAD_W = 1.5;     // at the world ceiling; capped it comes out 3.5px

/*
 * Screen caps are resolved by CSS, from the live zoom in `--s` (set on the
 * zoomed group in ChipCanvas), not from the `scale` prop.
 *
 * `scale` is the zoom rounded to quarter-octave steps, so that React only
 * rebuilds thousands of blocks every 19% of zoom instead of on every wheel
 * event. Computing a cap from it meant the cap was stale between steps: a
 * 5px rim drifted up to 5.9px and snapped back at each step. Near full zoom
 * everything is capped, so the whole die pulsed in step during a trackpad
 * pinch - a flicker that stopped the moment you did. CSS reads the real zoom
 * every frame at the cost of one custom property.
 */
const cap = (world, px) => `min(${world}px, calc(${px}px / var(--s, 1)))`;
const shrink = (ratio) => `scale(min(1, calc(${ratio} / var(--s, 1))))`;

/** Contact pad, flush with the block edge and centred on its port. */
function pad(b, p, long, short) {
  const half = long / 2;
  switch (p.side) {
    case 'left':   return { x: b.x,               y: p.y - half, w: short, h: long };
    case 'right':  return { x: b.x + b.w - short, y: p.y - half, w: short, h: long };
    case 'top':    return { x: p.x - half, y: b.y,               w: long, h: short };
    default:       return { x: p.x - half, y: b.y + b.h - short, w: long, h: short };
  }
}

/** Lead-frame geometry: a real package has rectangular pins, not hairlines. */
function lead(p, len, w) {
  switch (p.side) {
    case 'left':   return { x: p.x - len,   y: p.y - w / 2, w: len, h: w };
    case 'right':  return { x: p.x,         y: p.y - w / 2, w: len, h: w };
    case 'top':    return { x: p.x - w / 2, y: p.y - len,   w, h: len };
    default:       return { x: p.x - w / 2, y: p.y,         w, h: len };
  }
}

/**
 * The inside of a file, by what kind of circuit it is. See micro.jsx.
 *
 * Memory is the one with an anatomy: the array itself, a row decoder down one
 * side and sense amps along the bottom, which are ordinary logic. Those edge
 * strips are what make a real SRAM macro recognisable at a glance.
 */
function microstructure(b, family, theme) {
  const kind = STRUCTURE[family] || 'std';
  const minSide = Math.min(b.w, b.h);
  const at = (k, stage) => ({ opacity: detailOpacity(minSide, FADE_AT[k][stage]) });
  const coarse = at(kind, 'coarse');
  const fine = at(kind, 'fine');
  const v = variantOf(b.path, VARIANTS);

  const layer = (r, id, style, key) => (
    <rect key={key} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={`url(#${id})`} style={style} pointerEvents="none" />
  );
  // Logic keeps its own fade points even inside a memory's decoder strip.
  const logic = (r, key) => [
    layer(r, `ic-std-coarse-${v}`, at('std', 'coarse'), `${key}c`),
    layer(r, `ic-std-fine-${v}`, at('std', 'fine'), `${key}f`),
  ];

  const whole = { x: b.x, y: b.y, w: b.w, h: b.h };

  /*
   * The die photo underneath is a 120-unit tile; by the time gates resolve it
   * is magnified so far that it is only soft smears, which fight the crisp
   * structure on top. A flat wash in the block's own mid-tone settles it,
   * coming in with the fine detail so the zoomed-out look is untouched.
   */
  const [lo, hi] = theme.families[family]?.ramps?.[v] ?? ['#000000', '#000000'];
  const wash = (
    <rect key="w" x={b.x} y={b.y} width={b.w} height={b.h} fill={mix(lo, hi, 0.5)}
          style={{ opacity: `calc(${detailOpacity(minSide, FADE_AT.std.fine)} * 0.6)` }} pointerEvents="none" />
  );

  if (kind === 'std') return <g>{wash}{logic(whole, 's')}</g>;

  if (kind === 'analog') {
    return (
      <g>
        {wash}
        {layer(whole, 'ic-analog-coarse', coarse, 'c')}
        {layer(whole, 'ic-analog-fine', fine, 'f')}
        <rect x={b.x + 0.6} y={b.y + 0.6} width={b.w - 1.2} height={b.h - 1.2}
              fill="none" stroke={theme.guard} style={{ ...coarse, strokeWidth: cap(0.4, 1.5) }}
              pointerEvents="none" />
      </g>
    );
  }

  // SRAM: decoder on the left, sense amps along the bottom, array in between.
  const dec = Math.max(1.2, Math.min(b.w * 0.14, 8));
  const sense = Math.max(1.2, Math.min(b.h * 0.14, 6));
  const array = { x: b.x + dec, y: b.y, w: b.w - dec, h: b.h - sense };
  return (
    <g>
      {wash}
      {logic({ x: b.x, y: b.y, w: dec, h: b.h }, 'd')}
      {logic({ x: b.x + dec, y: b.y + b.h - sense, w: b.w - dec, h: sense }, 'a')}
      {layer(array, 'ic-sram-coarse', coarse, 'mc')}
      {layer(array, 'ic-sram-fine', fine, 'mf')}
    </g>
  );
}

/**
 * A file.
 *
 * What it looks like follows the medium, because the metaphor has to. On a
 * BOARD a file is a packaged chip: body, lead frame, pin-1 dot. On a DIE it is
 * simply a small region of silicon - there are no packages inside a die, and
 * drawing legs on one is the single most "illustrated" thing on the canvas.
 *
 * Boundaries are handled the way a die photograph handles them: a change of
 * texture and a dark gap, not a bright outline. A uniform stroke around every
 * rectangle is a diagram convention and reads as one instantly.
 */
export default function ICBlock({ b, theme, scale }) {
  if (theme.packaged && !b.synthetic) return <Package b={b} theme={theme} scale={scale} />;

  const family = theme.families[b.family] ? b.family : 'misc';
  const body = `url(#pat-fam-${family}-${variantOf(b.path)})`;
  const packaged = !!theme.packaged;

  const minPx = Math.min(b.w, b.h) * scale;
  const maxPx = Math.max(b.w, b.h) * scale;

  const showPins = packaged && minPx > 30 && b.ports.length > 0;
  const showPin1 = packaged && minPx > 26 && !b.synthetic;
  const showCavity = packaged && minPx > 44 && !b.synthetic;
  const showPads = !packaged && minPx > 22 && !b.synthetic && b.ports.length > 0;

  // Screen-capped, like the macro annotations. Sized purely in world units a
  // label grows with the zoom, so at 15x a filename came out 150px tall.
  const label = minPx > 12 && maxPx > 40
    ? fitLabel(b.name, b.w, b.h, { maxFont: 15 / scale })
    : null;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  // Die themes only: a board draws packages, and a package is opaque.
  const showMicro = !packaged && !b.synthetic && minPx > 70;
  const micro = showMicro ? microstructure(b, family, theme) : null;

  // Drawn at their world ceiling and shrunk about the port, so they stay
  // anchored to the edge while the cap takes over.
  const around = (x, y) => ({ transformOrigin: `${x}px ${y}px` });

  return (
    <g data-id={b.id}>
      {showPins && (
        <g fill={theme.ic.pin} opacity="0.9">
          {b.ports.map((p, i) => {
            const r = lead(p, PIN_LENGTH, LEAD_W);
            return (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h}
                    style={{ transform: shrink(LEAD_PX / PIN_LENGTH), ...around(p.x, p.y) }} />
            );
          })}
        </g>
      )}

      {/*
        A boundary on silicon has a physical width: it thickens as you magnify
        and disappears as you pull back, the way a real seal does.
        non-scaling-stroke pins it to exactly one screen pixel at every zoom,
        which is precisely what makes a rectangle look drawn rather than
        photographed. A board keeps the crisp stroke - a soldermask edge really
        is a hard line.
      */}
      <rect
        x={b.x} y={b.y} width={b.w} height={b.h}
        fill={body}
        stroke={packaged ? theme.ic.edge : theme.ic.rim}
        strokeWidth={packaged ? 1 : undefined}
        style={packaged ? undefined : { strokeWidth: cap(1.6, 5) }}
        strokeOpacity={b.synthetic ? 0.35 : packaged ? 0.7 : 0.55}
        strokeDasharray={b.synthetic && packaged ? '3 3' : undefined}
        vectorEffect={packaged ? 'non-scaling-stroke' : undefined}
      />

      {micro}

      {/* Die cavity outline inside the package body. */}
      {showCavity && (
        <rect
          x={b.x + 4} y={b.y + 4} width={b.w - 8} height={b.h - 8}
          fill="none" stroke={theme.ic.edge} style={{ strokeWidth: cap(0.6, 2) }} opacity="0.22"
        />
      )}

      {showPin1 && (
        <circle cx={b.x + 4.5} cy={b.y + 4.5} r={2.25} fill={theme.ic.pin1} opacity="0.9"
                style={{ transform: shrink(7 / 4.5), ...around(b.x, b.y) }} />
      )}

      {/*
        Contact pads: the metal landings a trace actually terminates on. They
        are why a file reads as a connected piece of circuitry rather than a
        filled rectangle, and they sit exactly where the router attaches.
      */}
      {showPads && (
        <g fill={theme.ic.pad} opacity="0.6">
          {b.ports.map((p, i) => {
            const r = pad(b, p, PAD_LONG, PAD_SHORT);
            return (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h}
                    style={{ transform: shrink(PAD_PX / PAD_LONG), ...around(p.x, p.y) }} />
            );
          })}
        </g>
      )}

      {label && (
        <text
          x={cx} y={cy} dominantBaseline="central"
          transform={label.vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
          fill={theme.ic.label} textAnchor="middle"
          fontFamily="var(--tech)" fontWeight="500"
          opacity={b.synthetic ? 0.6 : 0.92}
          style={{ fontSize: cap(label.fontSize, 15), strokeWidth: '0.2em' }}
          stroke={theme.textHalo}
          strokeLinejoin="round" paintOrder="stroke"
        >
          {label.text}
        </text>
      )}
    </g>
  );
}
