import { CHANNEL, PIN_LENGTH } from '../layout/constants.js';
import { fitLabel } from './text.js';

/**
 * A file on the board theme: a packaged chip.
 *
 * It used to be the die-theme block with a few extras bolted on - a green
 * photo texture, an outline, two to four stubby leads wherever a routing port
 * happened to be, an inner "cavity" rectangle and a big orange dot. Nothing
 * about that says "part soldered to a board". What does:
 *
 *   - a black epoxy body, lit slightly from above, casting a shadow
 *   - a full row of leads at a fixed pitch on the sides the package style
 *     has pins on, each landing on its own gold pad
 *   - grey laser marking on top rather than a printed label
 *   - a pin-1 dimple, and on a DIP the half-moon notch at one end
 *
 * The leads are decoration, and deliberately independent of the routing
 * ports: a real 14-pin DIP does not have 3 pins because 3 traces reach it.
 */

const pick = (arr, i) => arr[Math.max(0, Math.min(i, arr.length - 1))];
const f = (n) => +n.toFixed(3);
const box = (x, y, w, h) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;

/** Lead pitch by package, world units. SOT is placed by hand below. */
const PITCH = { SOIC: 2.6, DIP: 2.6, QFP: 1.8 };

/**
 * Which sides carry pins. Two-row packages put them along the LONG sides,
 * whichever way the block happens to lie - a DIP laid out 100 wide and 24
 * tall with its pins on the 24-unit ends is not a DIP.
 */
function sidesFor(pkg, b) {
  if (pkg === 'QFP') return ['top', 'right', 'bottom', 'left'];
  return b.w >= b.h ? ['top', 'bottom'] : ['left', 'right'];
}

/**
 * Positions along one side, centred, a pitch clear of each corner. SOT-23 is
 * the odd one out: two pins on one side and one on the other.
 */
function positions(pkg, side, len) {
  if (pkg === 'SOT') {
    return side === 'left' || side === 'bottom' ? [len * 0.25, len * 0.75] : [len * 0.5];
  }
  const pitch = PITCH[pkg] ?? PITCH.SOIC;
  const n = Math.floor((len - pitch * 1.8) / pitch) + 1;
  if (n < 1) return [];
  const start = (len - (n - 1) * pitch) / 2;
  return Array.from({ length: n }, (_, i) => start + i * pitch);
}

/** One side's leads and the pads under them, as two path strings. */
function leadRow(b, pkg, side, L) {
  const horiz = side === 'top' || side === 'bottom';
  const len = horiz ? b.w : b.h;
  const pitch = pkg === 'SOT' ? Math.min(len * 0.3, 3) : (PITCH[pkg] ?? PITCH.SOIC);
  const lw = pitch * 0.42;
  const pw = pitch * 0.62;
  let leads = '';
  let pads = '';
  for (const t of positions(pkg, side, len)) {
    const c = (horiz ? b.x : b.y) + t;
    // The pad starts under the lead's foot and runs a little past its tip.
    if (side === 'left') {
      leads += box(b.x - L, c - lw / 2, L, lw);
      pads += box(b.x - L - 0.35, c - pw / 2, L * 0.72 + 0.35, pw);
    } else if (side === 'right') {
      leads += box(b.x + b.w, c - lw / 2, L, lw);
      pads += box(b.x + b.w + L * 0.28, c - pw / 2, L * 0.72 + 0.35, pw);
    } else if (side === 'top') {
      leads += box(c - lw / 2, b.y - L, lw, L);
      pads += box(c - pw / 2, b.y - L - 0.35, pw, L * 0.72 + 0.35);
    } else {
      leads += box(c - lw / 2, b.y + b.h, lw, L);
      pads += box(c - pw / 2, b.y + b.h + L * 0.28, pw, L * 0.72 + 0.35);
    }
  }
  return { leads, pads };
}

const fmtBytes = (n) => {
  if (!n) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
};

export default function Package({ b, theme, scale }) {
  const ic = theme.ic;
  const minSide = Math.min(b.w, b.h);
  const minPx = minSide * scale;
  const maxPx = Math.max(b.w, b.h) * scale;
  const pkg = b.package || 'SOIC';

  /*
   * Leads live in the routing gap, so they may only take half of it or two
   * facing packages would interleave. The gap a block sits in is its
   * parent's channel width, and deep in the tree that is only 4 units.
   */
  const gap = pick(CHANNEL, b.depth - 1);
  const L = Math.max(0.6, Math.min(PIN_LENGTH, gap / 2 - 0.4));

  const showLeads = minPx > 18;
  const showMarks = minPx > 26;
  const rows = showLeads ? sidesFor(pkg, b).map((s) => leadRow(b, pkg, s, L)) : [];

  const label = minPx > 12 && maxPx > 40
    ? fitLabel(b.name, b.w * 0.9, b.h * 0.9, { maxFont: 13 / scale })
    : null;
  const sub = label && !label.vertical && minPx > 64
    ? `${(b.ext || '').toUpperCase()} ${fmtBytes(b.bytes)}`.trim()
    : '';

  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const inset = Math.min(2.4, minSide * 0.2);
  const dimple = Math.min(1.1, minSide * 0.1);

  // DIP notch: a half-moon cut into the end that has no pins. Pin 1 is the
  // corner just counter-clockwise of it, which is where the dimple goes.
  const notchR = Math.min(1.6, minSide * 0.16);
  const wide = b.w >= b.h;
  const notch = pkg === 'DIP' && showMarks
    ? (wide
      ? `M${f(b.x)} ${f(cy - notchR)}a${f(notchR)} ${f(notchR)} 0 0 1 0 ${f(notchR * 2)}z`
      : `M${f(cx - notchR)} ${f(b.y)}a${f(notchR)} ${f(notchR)} 0 0 0 ${f(notchR * 2)} 0z`)
    : null;
  const dot = wide
    ? { x: b.x + inset + dimple, y: b.y + b.h - inset - dimple }
    : { x: b.x + inset + dimple, y: b.y + inset + dimple };

  return (
    <g data-id={b.id}>
      {/* Shadow on the board, offset away from the light. */}
      <rect x={b.x + 0.5} y={b.y + 0.8} width={b.w} height={b.h} fill="#000" opacity="0.45" />

      {rows.length > 0 && (
        <g>
          <path d={rows.map((r) => r.pads).join('')} fill={ic.pad} opacity="0.8" />
          <path d={rows.map((r) => r.leads).join('')} fill={ic.lead} />
        </g>
      )}

      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={ic.body}
            stroke="#000" strokeOpacity="0.7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#pkg-sheen)" pointerEvents="none" />

      {notch && <path d={notch} fill={theme.page} opacity="0.9" />}
      {showMarks && (
        <circle cx={dot.x} cy={dot.y} r={dimple}
                fill="#000" opacity="0.55" stroke={ic.bodyHi} strokeWidth="1"
                vectorEffect="non-scaling-stroke" strokeOpacity="0.6" />
      )}

      {label && (
        <g transform={label.vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
           fontFamily="var(--mono)" textAnchor="middle" fill={ic.mark}>
          <text x={cx} y={cy} dy={sub ? '-0.25em' : undefined} dominantBaseline="central"
                style={{ fontSize: `min(${label.fontSize}px, calc(13px / var(--s, 1)))`, letterSpacing: '0.04em' }}>
            {label.text}
          </text>
          {sub && (
            <text x={cx} y={cy} dy="1.5em" dominantBaseline="central" opacity="0.7"
                  style={{ fontSize: `min(${label.fontSize * 0.62}px, calc(8px / var(--s, 1)))`, letterSpacing: '0.12em' }}>
              {sub}
            </text>
          )}
        </g>
      )}
    </g>
  );
}
