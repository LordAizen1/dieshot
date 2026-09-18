import { MACRO_TYPES, FAMILIES } from '../../shared/types.js';
import { POWER_PITCH } from '../layout/constants.js';
import { microDefs } from './micro.jsx';

/**
 * Block fills, from a real die photograph.
 *
 * Every block type is filled with an actual crop of photographed silicon,
 * picked because that region genuinely is that kind of circuit - a cache array
 * for MEMORY, standard-cell logic for CORE, a grid of identical macros for
 * PARALLEL, die-edge bus rails for IO. Synthetic line patterns were the tell:
 * real silicon is irregular, noisy and fine-grained, and no amount of tidy
 * geometry reads that way.
 *
 * Source: AMD Athlon K7 die shot by Fritzchens Fritz, CC0 1.0 (public domain).
 * See public/textures/CREDITS.md. Regenerate with tools/make-textures.py.
 *
 * The tiles ship GRAYSCALE and are coloured here by an feColorMatrix ramp, so
 * one set of assets serves every theme and the palette stays data-driven. The
 * matrix maps luminance L onto [shadow -> highlight]:
 *
 *     out_c = (hi_c - lo_c) * L + lo_c
 *
 * which is exactly the first column plus the offset column, with the other
 * input channels zeroed because a grayscale source carries L in all three.
 */

const TEXTURE_FILE = {
  TYPE_MEMORY: 'memory',
  TYPE_CORE: 'core',
  TYPE_PARALLEL: 'parallel',
  TYPE_PERIPHERAL: 'peripheral',
  TYPE_IO: 'io',
  TYPE_TEST: 'test',
};

/** World-space size of one texture tile. Fixed, like a real bitcell pitch. */
const TILE = 120;

/**
 * Per-variant pattern offsets.
 *
 * patternUnits is userSpaceOnUse, which anchors the texture to the die rather
 * than to each block - so without this, grain runs straight through a block
 * boundary and the die reads as one photograph with rectangles cut out of it.
 * Offsetting each variant breaks the alignment between neighbours.
 */
const OFFSET = [[0, 0], [47, 83], [91, 29]];

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

function rampMatrix(lo, hi) {
  const l = rgb(lo);
  const h = rgb(hi);
  const row = (i) => `${(h[i] - l[i]).toFixed(4)} 0 0 0 ${l[i].toFixed(4)}`;
  return `${row(0)} ${row(1)} ${row(2)} 0 0 0 1 0`;
}

export default function Patterns({ theme }) {
  const pitch = POWER_PITCH;
  const strap = 11;
  const mid = (pitch - strap) / 2;

  return (
    <defs>
      {MACRO_TYPES.flatMap((type) => {
        const t = theme.types[type];
        const file = TEXTURE_FILE[type] || 'core';
        return t.ramps.map(([lo, hi], i) => (
          <filter
            key={`f-${type}-${i}`}
            id={`tint-${type}-${i}`}
            colorInterpolationFilters="sRGB"
            x="0%" y="0%" width="100%" height="100%"
          >
            <feColorMatrix type="matrix" values={rampMatrix(lo, hi)} />
          </filter>
        )).concat(t.ramps.map((_, i) => (
          <pattern
            key={`p-${type}-${i}`}
            id={`pat-${type}-${i}`}
            width={TILE} height={TILE}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${OFFSET[i % OFFSET.length][0]} ${OFFSET[i % OFFSET.length][1]})`}
          >
            <image
              href={`textures/${file}.jpg`}
              x="0" y="0" width={TILE} height={TILE}
              preserveAspectRatio="none"
              filter={`url(#tint-${type}-${i})`}
            />
          </pattern>
        )));
      })}

      {/* Files reuse the standard-cell crop, tinted by extension family. */}
      {FAMILIES.flatMap((fam) => {
        const f = theme.families[fam];
        return f.ramps.map(([lo, hi], i) => (
          <filter
            key={`ff-${fam}-${i}`}
            id={`tint-fam-${fam}-${i}`}
            colorInterpolationFilters="sRGB"
            x="0%" y="0%" width="100%" height="100%"
          >
            <feColorMatrix type="matrix" values={rampMatrix(lo, hi)} />
          </filter>
        )).concat(f.ramps.map((_, i) => (
          <pattern
            key={`fp-${fam}-${i}`}
            id={`pat-fam-${fam}-${i}`}
            width={TILE} height={TILE}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${OFFSET[i % OFFSET.length][1]} ${OFFSET[i % OFFSET.length][0]})`}
          >
            <image
              href="textures/core.jpg"
              x="0" y="0" width={TILE} height={TILE}
              preserveAspectRatio="none"
              filter={`url(#tint-fam-${fam}-${i})`}
            />
          </pattern>
        )));
      })}

      {/*
        CMP dummy fill. A real process cannot leave large areas of a layer
        empty - planarity requires filler metal - so every gap on a die carries
        a regular grid of dummy squares. Drawn once, under everything: the
        blocks are opaque, so it shows through exactly where the die is empty.
      */}
      <pattern id="pat-fill" width="7" height="7" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="none" />
        <rect x="1" y="1" width="2.6" height="2.6" fill={theme.fill} opacity="0.85" />
      </pattern>

      {/*
        Top-metal power grid: wide VDD/VSS straps at a regular pitch with a via
        array at every crossing. This is the feature that reads instantly as a
        die photograph, and as a single patterned rect it costs one node.
      */}
      <pattern id="pat-power" width={pitch} height={pitch} patternUnits="userSpaceOnUse">
        <rect x="0" y={mid} width={pitch} height={strap} fill={theme.metalH} opacity="0.55" />
        <rect x={mid} y="0" width={strap} height={pitch} fill={theme.metalV} opacity="0.34" />
        {/* Bright edges: a thick metal strap catches light along its sidewalls. */}
        <line x1="0" y1={mid + 0.7} x2={pitch} y2={mid + 0.7}
              stroke={theme.via} strokeWidth="0.9" opacity="0.55" />
        <line x1="0" y1={mid + strap - 0.7} x2={pitch} y2={mid + strap - 0.7}
              stroke={theme.via} strokeWidth="0.9" opacity="0.3" />
        <line x1={mid + 0.7} y1="0" x2={mid + 0.7} y2={pitch}
              stroke={theme.via} strokeWidth="0.9" opacity="0.28" />
        {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
          <rect
            key={`${r}-${c}`}
            x={mid + 2.2 + c * 3.4} y={mid + 2.2 + r * 3.4}
            width="2" height="2"
            fill={theme.via} opacity="0.5"
          />
        )))}
      </pattern>

      {/* Routing corridor, shown only when the overlay is toggled on. */}
      <pattern id="pat-channel" width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill={theme.channel} />
        <line x1="0" y1="5" x2="5" y2="0" stroke={theme.channelHatch} strokeWidth="1" opacity="0.75" />
      </pattern>

      {microDefs(theme)}

      {/* Uneven illumination - a die photo is never lit flat. */}
      <radialGradient id="die-light" cx="38%" cy="28%" r="78%">
        <stop offset="0%" stopColor={theme.light} stopOpacity="0.1" />
        <stop offset="55%" stopColor={theme.light} stopOpacity="0.028" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
      </radialGradient>
    </defs>
  );
}
