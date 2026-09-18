import { rgba, shift, tints } from './color.js';

/**
 * Two palettes, same geometry.
 *
 * `blueprint` is a die photograph: near-black navy substrate, cyan metal.
 * `pcb` is a board: dark solder mask, copper and gold.
 *
 * `metal` drives the top-layer power grid that crosses the whole die - the
 * single most recognisable feature of a real die shot. `fill` is CMP dummy
 * metal, the regular filler that occupies every region a real process leaves
 * otherwise empty.
 */

const BLUEPRINT = {
  key: 'blueprint',
  label: 'BLUEPRINT',
  packaged: false,
  page: '#03070e',
  substrate: '#05101f',
  dieFill: '#030b16',
  seal: '#3d8fc4',
  pad: '#9fdcff',
  padOpening: '#1d5f88',
  fiducial: '#7fc4ef',
  channel: '#082c3f',
  channelEdge: '#2f8fc0',
  channelHatch: '#4fd6ff',
  text: '#d8ecff',
  dim: '#5f8db2',
  accent: '#57c9ff',
  grid: '#0a1c2e',

  metalH: '#7fc9f5',
  metalV: '#4a9ad0',
  via: '#cdeaff',
  fill: '#0c2033',
  guard: '#79c6ee',
  sense: '#9ad8f7',
  light: '#9fd8ff',

  types: {
    TYPE_MEMORY:     { fill: '#17395c', stroke: '#8ddcf0', ink: '#e3f7ff' },
    TYPE_PARALLEL:   { fill: '#123255', stroke: '#6fb0ff', ink: '#d9e7ff' },
    TYPE_IO:         { fill: '#14374f', stroke: '#93cfff', ink: '#e0f1ff' },
    TYPE_CORE:       { fill: '#0d2742', stroke: '#5aabe2', ink: '#cbe7ff' },
    TYPE_PERIPHERAL: { fill: '#0a1e33', stroke: '#4c8ab8', ink: '#aed0e8' },
    TYPE_TEST:       { fill: '#07172a', stroke: '#3a688c', ink: '#8fb3cd' },
  },
  families: {
    logic:  '#12395a',
    config: '#124046',
    style:  '#2a2456',
    doc:    '#163350',
    asset:  '#0f2c3c',
    misc:   '#0d2234',
  },
  ic: { edge: '#6cc0f2', pin: '#a9dcff', label: '#d5ecff', pin1: '#ffd479', pad: '#a9dcff' },
  traceOut: '#d8f3ff',
  traceIn: '#ffc46b',
};

const PCB = {
  key: 'pcb',
  label: 'PCB',
  packaged: true,
  page: '#040d08',
  substrate: '#07190f',
  dieFill: '#04110a',
  seal: '#c9a227',
  pad: '#e8c766',
  padOpening: '#8a6a1c',
  fiducial: '#e0b64a',
  channel: '#2a2410',
  channelEdge: '#a8862c',
  channelHatch: '#e8c766',
  text: '#dff3e4',
  dim: '#6a9a7c',
  accent: '#e0b64a',
  grid: '#0a2114',

  metalH: '#e0b64a',
  metalV: '#a8802a',
  via: '#ffe9a8',
  fill: '#0b2114',
  guard: '#cfa63c',
  sense: '#f0cf84',
  light: '#ffe6a8',

  types: {
    TYPE_MEMORY:     { fill: '#133a24', stroke: '#83dcab', ink: '#e2fbec' },
    TYPE_PARALLEL:   { fill: '#0f3328', stroke: '#5ac79d', ink: '#d6f5e8' },
    TYPE_IO:         { fill: '#123720', stroke: '#93ddaf', ink: '#e2fbec' },
    TYPE_CORE:       { fill: '#0b2417', stroke: '#4fa871', ink: '#cdebd8' },
    TYPE_PERIPHERAL: { fill: '#081c12', stroke: '#3f8460', ink: '#a5ccb4' },
    TYPE_TEST:       { fill: '#06140d', stroke: '#356a4a', ink: '#8fb79e' },
  },
  families: {
    logic:  '#123a22',
    config: '#12392f',
    style:  '#27351b',
    doc:    '#123425',
    asset:  '#0f2c21',
    misc:   '#0d2418',
  },
  ic: {
    edge: '#d9a441', pin: '#f0cf84', label: '#f2e6c8', pin1: '#ff8a5b', pad: '#d7b25a',
    // Packaged parts: black epoxy, tinned leads, grey laser marking.
    body: '#141615', bodyHi: '#3a3e3b', lead: '#c3c7c1', mark: '#9ea39c',
  },
  traceOut: '#ffe9a8',
  traceIn: '#8fe3b0',
};


/**
 * What the photograph actually looks like.
 *
 * blueprint and pcb are stylisations; this is the die as an optical microscope
 * sees it - warm metal over dark substrate, with each block type landing on a
 * slightly different hue the way real layer stacks do. Because the textures are
 * grayscale and coloured by a ramp, this costs no extra assets.
 */
const SILICON = {
  key: 'silicon',
  label: 'SILICON',
  packaged: false,
  page: '#070503',
  substrate: '#0d0805',
  dieFill: '#100a05',
  seal: '#c49a48',
  pad: '#f0d79a',
  padOpening: '#6b4a1c',
  fiducial: '#e8c47a',
  channel: '#2a1d0c',
  channelEdge: '#b8873a',
  channelHatch: '#ffd98a',
  text: '#f6e6c8',
  dim: '#a98f63',
  accent: '#ffcf6b',
  grid: '#1a1209',

  metalH: '#f0d08a',
  metalV: '#b8893c',
  via: '#fff0c4',
  fill: '#241a0e',
  guard: '#d8a94e',
  sense: '#ffe6a8',
  light: '#ffe2a0',

  types: {
    TYPE_MEMORY:     { fill: '#6d5a1f', stroke: '#ffe28a', ink: '#fff4d4' },
    TYPE_PARALLEL:   { fill: '#5d5f24', stroke: '#e8ee92', ink: '#f6fbd8' },
    TYPE_IO:         { fill: '#5a5526', stroke: '#e4dc8e', ink: '#f7f2d6' },
    TYPE_CORE:       { fill: '#6b4a22', stroke: '#f2bd74', ink: '#ffe9cc' },
    TYPE_PERIPHERAL: { fill: '#4d3418', stroke: '#c9955a', ink: '#efd4b2' },
    TYPE_TEST:       { fill: '#2c1f10', stroke: '#8f6c3e', ink: '#c9ab84' },
  },
  families: {
    logic:  '#6a4c20',
    config: '#5b5426',
    style:  '#63401f',
    doc:    '#59492a',
    asset:  '#4a4020',
    misc:   '#3a2c16',
  },
  ic: { edge: '#e6b96a', pin: '#ffe0a0', label: '#fff2d8', pin1: '#ff8f4a', pad: '#ffd98a' },
  traceOut: '#fff0c0',
  traceIn: '#ff9a5b',
};

/**
 * Precompute per-type tints and edges.
 *
 * The edge is a DARKENED version of the block's own fill, not a bright outline.
 * Bright uniform strokes are the strongest tell of a diagram; real blocks are
 * separated by a dark gap and a change of texture, so that is what is drawn.
 */
function prepare(theme) {
  // A near-black rim reads as the shadowed gap between two regions of silicon.
  // A bright one reads as ink, which is the thing to avoid.
  theme.ic.rim = shift(theme.dieFill, 0, 0, 0.03);

  // Labels sit straight on the texture, so they carry their own halo instead of
  // a panel behind them - the way an annotated die shot captions a block.
  theme.textHalo = rgba(theme.dieFill, 0.62);

  for (const t of Object.values(theme.types)) {
    t.tints = tints(t.fill);
    t.edge = shift(t.fill, 0, 0, -0.045);
    // Each tint becomes a [shadow, highlight] ramp. The grayscale die texture
    // is mapped onto it at render time, so black silicon lands on the block's
    // own dark tone and bright metal lands near its type colour.
    t.ramps = t.tints.map((c) => [
      shift(c, 0, 0, -0.06),
      shift(c, 0, 0.05, 0.28),
    ]);
  }
  // Files get the same treatment: a flat fill reads as a plastic card once the
  // macros around it are photographic.
  for (const [k, v] of Object.entries(theme.families)) {
    const ts = tints(v);
    theme.families[k] = {
      base: v,
      tints: ts,
      ramps: ts.map((c) => [shift(c, 0, 0, -0.06), shift(c, 0, 0.05, 0.24)]),
    };
  }
  return theme;
}

export const THEMES = {
  silicon: prepare(SILICON),
  blueprint: prepare(BLUEPRINT),
  pcb: prepare(PCB),
};

export const THEME_KEYS = Object.keys(THEMES);
