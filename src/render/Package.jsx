import { CHANNEL, PIN_LENGTH } from '../layout/constants.js';
import { fitLabel } from './text.js';
import { variantOf } from './color.js';

const cap = (world, px) => `min(${world}px, calc(${px}px / var(--s, 1)))`;
const shrink = (ratio) => `scale(min(1, calc(${ratio} / var(--s, 1))))`;

/**
 * A file on the board theme: the textured body in the theme's own colours,
 * with a full row of leads at a fixed pitch on the package's pin sides, each
 * on its own pad. The leads are decoration and independent of the routing
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
  const rows = showLeads ? sidesFor(pkg, b).map((s) => leadRow(b, pkg, s, L)) : [];

  const family = theme.families[b.family] ? b.family : 'misc';
  const label = minPx > 12 && maxPx > 40
    ? fitLabel(b.name, b.w, b.h, { maxFont: 15 / scale })
    : null;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  return (
    <g data-id={b.id}>
      {rows.length > 0 && (
        <g>
          <path d={rows.map((r) => r.pads).join('')} fill={ic.pad} opacity="0.8" />
          <path d={rows.map((r) => r.leads).join('')} fill={ic.lead} />
        </g>
      )}

      <rect
        x={b.x} y={b.y} width={b.w} height={b.h}
        fill={`url(#pat-fam-${family}-${variantOf(b.path)})`}
        stroke={ic.edge} strokeWidth="1" strokeOpacity="0.7" vectorEffect="non-scaling-stroke"
      />

      {/* Die cavity outline inside the package body. */}
      {minPx > 44 && (
        <rect
          x={b.x + 4} y={b.y + 4} width={b.w - 8} height={b.h - 8}
          fill="none" stroke={ic.edge} style={{ strokeWidth: cap(0.6, 2) }} opacity="0.22"
        />
      )}

      {minPx > 26 && (
        <circle cx={b.x + 4.5} cy={b.y + 4.5} r={2.25} fill={ic.pin1} opacity="0.9"
                style={{ transform: shrink(7 / 4.5), transformOrigin: `${b.x}px ${b.y}px` }} />
      )}

      {label && (
        <text
          x={cx} y={cy} dominantBaseline="central"
          transform={label.vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
          fill={ic.label} textAnchor="middle"
          fontFamily="var(--tech)" fontWeight="500" opacity="0.92"
          style={{ fontSize: cap(label.fontSize, 15), strokeWidth: '0.2em' }}
          stroke={theme.textHalo} strokeLinejoin="round" paintOrder="stroke"
        >
          {label.text}
        </text>
      )}
    </g>
  );
}
