import { PIN_LENGTH } from '../layout/constants.js';
import { fitLabel } from './text.js';
import { variantOf } from './color.js';

const PIN_W = 2.5;   // lead width; stays well inside the narrowest channel
const PAD_LONG = 3.2;
const PAD_SHORT = 2.2;

/** Contact pad sitting just inside the block edge, centred on its port. */
function pad(b, p) {
  switch (p.side) {
    case 'left':   return { x: b.x + 0.8, y: p.y - PAD_LONG / 2, w: PAD_SHORT, h: PAD_LONG };
    case 'right':  return { x: b.x + b.w - 0.8 - PAD_SHORT, y: p.y - PAD_LONG / 2, w: PAD_SHORT, h: PAD_LONG };
    case 'top':    return { x: p.x - PAD_LONG / 2, y: b.y + 0.8, w: PAD_LONG, h: PAD_SHORT };
    default:       return { x: p.x - PAD_LONG / 2, y: b.y + b.h - 0.8 - PAD_SHORT, w: PAD_LONG, h: PAD_SHORT };
  }
}

/** Lead-frame geometry: a real package has rectangular pins, not hairlines. */
function lead(p) {
  switch (p.side) {
    case 'left':   return { x: p.x - PIN_LENGTH, y: p.y - PIN_W / 2, w: PIN_LENGTH, h: PIN_W };
    case 'right':  return { x: p.x,              y: p.y - PIN_W / 2, w: PIN_LENGTH, h: PIN_W };
    case 'top':    return { x: p.x - PIN_W / 2,  y: p.y - PIN_LENGTH, w: PIN_W, h: PIN_LENGTH };
    default:       return { x: p.x - PIN_W / 2,  y: p.y,              w: PIN_W, h: PIN_LENGTH };
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

  return (
    <g data-id={b.id}>
      {showPins && (
        <g fill={theme.ic.pin} opacity="0.9">
          {b.ports.map((p, i) => {
            const r = lead(p);
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
        <circle cx={b.x + 4.5} cy={b.y + 4.5} r="1.6" fill={theme.ic.pin1} opacity="0.9" />
      )}

      {/*
        Contact pads: the metal landings a trace actually terminates on. They
        are why a file reads as a connected piece of circuitry rather than a
        filled rectangle, and they sit exactly where the router attaches.
      */}
      {showPads && (
        <g fill={theme.ic.pad} opacity="0.75">
          {b.ports.map((p, i) => {
            const r = pad(b, p);
            return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="0.5" />;
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
