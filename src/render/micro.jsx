/**
 * What a file looks like once you are close enough to see into it.
 *
 * Zoomed in, a file used to be a box: one crop of die photo stretched far past
 * its resolution, with an outline. A real block under a microscope is made of
 * something, and what it is made of depends on what it does:
 *
 *   logic   standard-cell rows between power rails, poly gates in every cell,
 *           metal-2 routing along the rows and metal-3 across them
 *   memory  a bitcell array - identical cells, wordlines one way and bitline
 *           pairs the other - with the decoder and sense amps on its edges
 *   analog  a few large devices: capacitor plates with a contact row, inside
 *           a guard ring
 *
 * All of it is vector patterns, so a file costs two or three extra nodes
 * whatever its size. Detail comes in two stages because it lives at two
 * scales: rows and cells read from a few pixels up, but gates and routing sit
 * a sixth of a row apart and would alias into moire if shown any earlier.
 *
 * Deterministic: the RNG is seeded, so the same die draws the same cells.
 */

/** Standard-cell row pitch, in world units. Everything below derives from it. */
export const ROW = 2.4;

// Big enough that the repeat is not obvious: at 4 rows the same wiring came
// round every fourth row and the eye caught it immediately.
const STD_W = 48;
const STD_ROWS = 8;
const GATE_PITCH = 0.4;

const BIT_W = 0.9;            // one SRAM bitcell
const BIT_H = 0.6;
const BITS = 8;               // tile is BITS x BITS cells

const CAP = 12;               // analog tile

export const VARIANTS = 3;

/** mulberry32: small, fast, and good enough to lay out fake transistors. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => +n.toFixed(3);
const box = (x, y, w, h) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;

/** One standard-cell tile: the coarse layer (cells, rails) and the fine one. */
function stdTile(seed) {
  const r = rng(seed);
  const widths = [0.8, 1.2, 1.2, 1.6, 2, 2.4, 2.8, 3.6, 4.8];
  let cellsA = '';   // alternating tones so neighbouring cells separate
  let cellsB = '';
  let rails = '';
  let diff = '';     // active area: a PMOS strip by one rail, NMOS by the other
  let gates = '';
  let m1 = '';
  let m2 = '';
  let m3 = '';
  let vias = '';

  for (let row = 0; row < STD_ROWS; row++) {
    const y0 = row * ROW;
    rails += box(0, y0 - 0.13, STD_W, 0.26);

    let x = 0;
    let k = 0;
    while (x < STD_W - 0.4) {
      const w = Math.min(widths[Math.floor(r() * widths.length)], STD_W - x);
      const cell = box(x + 0.05, y0 + 0.28, w - 0.1, ROW - 0.56);
      if (k++ % 2) cellsA += cell; else cellsB += cell;

      // Filler cells have no transistors; real rows are sprinkled with them.
      if (r() > 0.14 && w >= 1.2) {
        diff += box(x + 0.18, y0 + 0.42, w - 0.36, 0.56);
        diff += box(x + 0.18, y0 + ROW - 0.98, w - 0.36, 0.56);
        // Gates cross both strips; a wide cell sometimes breaks them in two.
        const split = w > 2.4 && r() > 0.5;
        for (let gx = x + GATE_PITCH; gx < x + w - 0.25; gx += GATE_PITCH) {
          if (split && r() > 0.5) {
            gates += `M${f(gx)} ${f(y0 + 0.32)}v0.8M${f(gx)} ${f(y0 + ROW - 1.12)}v0.8`;
          } else {
            gates += `M${f(gx)} ${f(y0 + 0.32)}v${f(ROW - 0.64)}`;
          }
        }
        // Metal 1 ties the gates together through the middle of the cell.
        if (r() > 0.3) {
          const a = x + 0.25 + r() * (w * 0.3);
          const b = x + w - 0.25 - r() * (w * 0.3);
          if (b - a > 0.3) m1 += `M${f(a)} ${f(y0 + ROW / 2)}H${f(b)}`;
        }
      }
      x += w;
    }

    // Metal 2 runs along the row, on one of two tracks, with a via each end.
    const tracks = [0.4, 0.62].map((t) => y0 + ROW * t);
    for (let n = 0; n < 3; n++) {
      const ty = tracks[Math.floor(r() * tracks.length)];
      const sx = r() * STD_W * 0.85;
      const len = 3 + r() * 9;
      const ex = Math.min(STD_W, sx + len);
      m2 += `M${f(sx)} ${f(ty)}H${f(ex)}`;
      vias += box(sx - 0.11, ty - 0.11, 0.22, 0.22) + box(ex - 0.11, ty - 0.11, 0.22, 0.22);
    }
  }

  // Metal 3 crosses the rows.
  for (let n = 0; n < 9; n++) {
    const x = 0.6 + r() * (STD_W - 1.2);
    const a = Math.floor(r() * STD_ROWS);
    const b = Math.min(STD_ROWS, a + 1 + Math.floor(r() * 3));
    m3 += `M${f(x)} ${f(a * ROW + ROW * 0.5)}V${f(b * ROW - ROW * 0.5)}`;
  }

  return { cellsA, cellsB, rails, diff, gates, m1, m2, m3, vias };
}

function sramTile() {
  let cells = '';
  let contacts = '';
  let wordlines = '';
  let bitlines = '';
  for (let j = 0; j < BITS; j++) {
    for (let i = 0; i < BITS; i++) {
      cells += box(i * BIT_W + 0.06, j * BIT_H + 0.06, BIT_W - 0.12, BIT_H - 0.12);
      // Mirrored pairs share a contact on their common edge.
      if (j % 2 === 0) contacts += box(i * BIT_W + BIT_W / 2 - 0.06, (j + 1) * BIT_H - 0.06, 0.12, 0.12);
    }
    wordlines += `M0 ${f(j * BIT_H + BIT_H * 0.5)}H${f(BITS * BIT_W)}`;
  }
  for (let i = 0; i < BITS; i++) {
    bitlines += `M${f(i * BIT_W + 0.24)} 0V${f(BITS * BIT_H)}M${f(i * BIT_W + 0.66)} 0V${f(BITS * BIT_H)}`;
  }
  return { cells, contacts, wordlines, bitlines };
}

function analogTile() {
  let plates = '';
  let tops = '';
  let contacts = '';
  const s = CAP / 2;
  for (const [cx, cy] of [[0, 0], [s, 0], [0, s], [s, s]]) {
    plates += box(cx + 0.5, cy + 0.5, s - 1, s - 1);
    tops += box(cx + 1.1, cy + 1.1, s - 2.2, s - 2.6);
    for (let k = 0; k < 6; k++) {
      contacts += box(cx + 1.2 + k * ((s - 2.6) / 5), cy + s - 1.25, 0.28, 0.28);
    }
  }
  return { plates, tops, contacts };
}

const STD = Array.from({ length: VARIANTS }, (_, v) => stdTile(1013 + v * 7919));
const SRAM = sramTile();
const ANALOG = analogTile();

/** What each file family is built from. */
export const STRUCTURE = {
  logic: 'std',
  style: 'std',
  misc: 'std',
  config: 'sram',
  doc: 'sram',
  asset: 'analog',
};

/**
 * The pattern defs. Anchored to the die (userSpaceOnUse) like the real thing:
 * cell rows line up across neighbouring blocks, because a placement grid is
 * global. Variants shift the tile sideways only, never off the row grid.
 */
export function microDefs(theme) {
  const dark = '#000000';
  return [
    ...STD.flatMap((t, v) => [
      <pattern key={`sc${v}`} id={`ic-std-coarse-${v}`} width={STD_W} height={STD_ROWS * ROW}
               patternUnits="userSpaceOnUse" patternTransform={`translate(${v * 11.3} 0)`}>
        <path d={t.cellsA} fill={dark} opacity="0.2" />
        <path d={t.cellsB} fill={dark} opacity="0.1" />
        <path d={t.rails} fill={theme.metalH} opacity="0.22" />
      </pattern>,
      <pattern key={`sf${v}`} id={`ic-std-fine-${v}`} width={STD_W} height={STD_ROWS * ROW}
               patternUnits="userSpaceOnUse" patternTransform={`translate(${v * 11.3} 0)`}>
        <path d={t.diff} fill={theme.via} opacity="0.12" />
        <path d={t.gates} stroke={theme.via} strokeWidth="0.08" opacity="0.3" fill="none" />
        <path d={t.m1} stroke={theme.metalV} strokeWidth="0.16" opacity="0.45" fill="none" />
        <path d={t.m2} stroke={theme.metalV} strokeWidth="0.13" opacity="0.7" fill="none" />
        <path d={t.m3} stroke={theme.metalH} strokeWidth="0.18" opacity="0.5" fill="none" />
        <path d={t.vias} fill={theme.via} opacity="0.8" />
      </pattern>,
    ]),
    <pattern key="mc" id="ic-sram-coarse" width={BITS * BIT_W} height={BITS * BIT_H} patternUnits="userSpaceOnUse">
      <path d={SRAM.cells} fill={dark} opacity="0.2" />
      <path d={SRAM.wordlines} stroke={theme.metalH} strokeWidth="0.1" opacity="0.45" fill="none" />
    </pattern>,
    <pattern key="mf" id="ic-sram-fine" width={BITS * BIT_W} height={BITS * BIT_H} patternUnits="userSpaceOnUse">
      <path d={SRAM.bitlines} stroke={theme.metalV} strokeWidth="0.07" opacity="0.6" fill="none" />
      <path d={SRAM.contacts} fill={theme.via} opacity="0.75" />
    </pattern>,
    <pattern key="ac" id="ic-analog-coarse" width={CAP} height={CAP} patternUnits="userSpaceOnUse">
      <path d={ANALOG.plates} fill={dark} opacity="0.22" />
      <path d={ANALOG.tops} fill={theme.metalH} opacity="0.22" />
    </pattern>,
    <pattern key="af" id="ic-analog-fine" width={CAP} height={CAP} patternUnits="userSpaceOnUse">
      <path d={ANALOG.contacts} fill={theme.via} opacity="0.75" />
    </pattern>,
  ];
}

/*
 * Fade-ins, resolved by CSS from the live zoom (--s) so they never step.
 *
 * Each layer is gated twice: by DENSITY, so a pattern only appears once its
 * finest feature is several screen pixels apart, and by BLOCK SIZE, so a small
 * file does not turn into texture soup the moment the zoom allows it. The
 * opacity is the smaller of the two ramps.
 */
/** Blend two #rrggbb colours; used for the flat tint under the fine detail. */
export function mix(a, b, t) {
  const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) =>
    Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('');
}

const ramp = (expr, from, span) => `clamp(0, calc((${expr} - ${from}) / ${span}), 1)`;

/**
 * Zoom (screen px per world unit) at which each layer starts to fade in: the
 * point where its finest repeating feature is ~5px apart on screen. Memory
 * needs far more magnification than logic, which is also what a real die
 * does - an SRAM array reads as a smooth, even region until you are close.
 */
export const FADE_AT = {
  std: { coarse: 5.3 / ROW, fine: 3.6 / GATE_PITCH },     // rows, then gates
  sram: { coarse: 5 / BIT_H, fine: 4 / 0.42 },            // wordlines, then bitlines
  analog: { coarse: 5 / (CAP / 2), fine: 4 / 0.6 },       // plates, then contacts
};

export function detailOpacity(minSide, start) {
  const px = `${minSide} * var(--s, 1)`;
  const density = ramp('var(--s, 1)', f(start), f(start * 0.8));
  return `min(${density}, ${ramp(px, 90, 110)})`;
}
