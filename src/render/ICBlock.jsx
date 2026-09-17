import { PIN_LENGTH } from '../layout/constants.js';
import { fitLabel } from './text.js';
import { variantOf } from './color.js';

const PIN_W = 2.5;      // lead width; stays well inside the narrowest channel
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

  const padLong = Math.min(PAD_LONG, PAD_PX / scale);
  const padShort = Math.min(PAD_SHORT, (PAD_PX * 0.68) / scale);
  const leadLen = Math.min(PIN_LENGTH, LEAD_PX / scale);
  const leadW = Math.min(PIN_W, (LEAD_PX * 0.5) / scale);
  const dotR = Math.min(1.6, 3.5 / scale);
  const dotIn = Math.min(4.5, 7 / scale);

  return (
    <g data-id={b.id}>
      {showPins && (
        <g fill={theme.ic.pin} opacity="0.9">
          {b.ports.map((p, i) => {
            const r = lead(p, leadLen, leadW);
            return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />;
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
        strokeWidth={packaged ? 1 : Math.min(1.6, 5 / scale)}
        strokeOpacity={b.synthetic ? 0.35 : packaged ? 0.7 : 0.55}
        strokeDasharray={b.synthetic && packaged ? '3 3' : undefined}
        vectorEffect={packaged ? 'non-scaling-stroke' : undefined}
      />

      {/* Die cavity outline inside the package body. */}
      {showCavity && (
        <rect
          x={b.x + 4} y={b.y + 4} width={b.w - 8} height={b.h - 8}
          fill="none" stroke={theme.ic.edge} strokeWidth={Math.min(0.6, 2 / scale)} opacity="0.22"
        />
      )}

      {showPin1 && (
        <circle cx={b.x + dotIn} cy={b.y + dotIn} r={dotR} fill={theme.ic.pin1} opacity="0.9" />
      )}

      {/*
        Contact pads: the metal landings a trace actually terminates on. They
        are why a file reads as a connected piece of circuitry rather than a
        filled rectangle, and they sit exactly where the router attaches.
      */}
      {showPads && (
        <g fill={theme.ic.pad} opacity="0.6">
          {b.ports.map((p, i) => {
            const r = pad(b, p, padLong, padShort);
            return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />;
          })}
        </g>
      )}

      {label && (
        <text
          x={cx} y={cy + label.fontSize * 0.36}
          transform={label.vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
          fontSize={label.fontSize} fill={theme.ic.label} textAnchor="middle"
          fontFamily="var(--tech)" fontWeight="500"
          opacity={b.synthetic ? 0.6 : 0.92}
          stroke={theme.textHalo} strokeWidth={label.fontSize * 0.2}
          strokeLinejoin="round" paintOrder="stroke"
        >
          {label.text}
        </text>
      )}
    </g>
  );
}
