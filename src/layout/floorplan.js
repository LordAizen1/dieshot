/**
 * DIESHOT - recursive slicing floorplan.
 *
 * A slicing floorplan is a rectangle recursively bisected by cuts, where every
 * cut spans its parent edge-to-edge. Widen each cut from a line into a CHANNEL
 * (a reserved empty strip) and those channels form a hierarchically connected
 * orthogonal graph: any two blocks can be joined by a Manhattan path that never
 * crosses a block, at every level of nesting.
 *
 * So the padding is not margin. It is the routing resource, and it is emitted
 * as first-class geometry in `channels[]` for the router to path through.
 *
 * Pure: no React, no DOM, no fs. Same input always produces the same die.
 */
import {
  GRID, CHANNEL, SEAL, LABEL_H, MIN_SIDE, MIN_AREA, MIN_ASPECT,
  PIN_PITCH, CELL_PITCH, MIN_DIE, MAX_DIE, DIR_AREA, LABEL_VERTICAL_RATIO,
} from './constants.js';
import { WEIGHT_MODES } from './weight.js';
import {
  LAYOUT_POLICY, TYPE_CORE, TYPE_IC, PKG_SIDES, PKG_MAX_PINS,
} from '../../shared/types.js';

const snap = (v) => Math.round(v / GRID) * GRID;
const pick = (arr, i) => arr[Math.min(i, arr.length - 1)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} tree   nested scan tree (dirs have `children`, files do not)
 * @param {object} opts   { weightMode, cellPitch, aspect }
 * @returns {{die, blocks, channels, stats}}
 */
export function floorplan(rawTree, opts = {}) {
  const o = {
    weightMode: 'sqrt',
    cellPitch: CELL_PITCH,
    aspect: 1,
    collapseChains: true,
    dirArea: DIR_AREA,
    minArea: MIN_AREA,
    ...opts,
  };
  const transform = WEIGHT_MODES[o.weightMode] || WEIGHT_MODES.sqrt;
  const tree = rawTree && o.collapseChains ? collapseChains(rawTree) : rawTree;

  const blocks = [];
  const channels = [];
  const byId = new Map();
  const weights = new Map();
  const stats = {
    files: 0, dirs: 0, maxDepth: 0, culled: 0, tight: 0, icArea: 0,
  };
  let uid = 0;

  if (!rawTree) {
    return {
      die: { w: MIN_DIE, h: MIN_DIE },
      blocks, channels,
      stats: { ...stats, fillRatio: 0 },
    };
  }

  /* ------------------------------------------------- pass 1: bottom-up weight */

  const weigh = (node) => {
    let w;
    if (Array.isArray(node.children)) {
      stats.dirs++;
      w = 0;
      for (const c of node.children) w += weigh(c);
      if (w <= 0) w = transform(1);          // empty dir still needs a footprint
    } else {
      stats.files++;
      w = Math.max(transform(node.size || 0), 1e-6);
    }
    weights.set(node, w);
    return w;
  };
  weigh(tree);

  const wOf = (n) => weights.get(n) ?? 1e-6;

  /* ---------------------------------------------------------- pass 2: die size */

  // Directories are not free: each one spends a seal ring and a label bar that
  // no file can occupy. Budgeting area for files alone is what starves deep
  // trees and forces mass culling, so each directory buys `dirArea` cells too.
  const budget = stats.files + o.dirArea * stats.dirs;
  const side = clamp(snap(Math.sqrt(Math.max(budget, 1)) * o.cellPitch), MIN_DIE, MAX_DIE);
  const ratio = Math.sqrt(o.aspect || 1);
  const die = { w: snap(side * ratio), h: snap(side / ratio) };

  /* ------------------------------------------------------- pass 3: place blocks */

  place(tree, { x: 0, y: 0, w: die.w, h: die.h }, 0, null);

  /*
   * Largest immediate child of each macro, in both metrics the renderer tests
   * against. With these it can ask "can anything inside this possibly qualify
   * at this zoom?" and skip the child scan entirely when the answer is no -
   * which at fit zoom is most of the tree, since testing every child of every
   * placed block is what the pass actually spends its time on.
   */
  for (const b of blocks) {
    const parent = b.parentId && byId.get(b.parentId);
    if (!parent) continue;
    const side = Math.min(b.w, b.h);
    const diag = Math.sqrt(b.w * b.h);
    if (side > (parent.maxChildSide || 0)) parent.maxChildSide = side;
    if (diag > (parent.maxChildDiag || 0)) parent.maxChildDiag = diag;
  }

  return {
    die,
    blocks,
    channels,
    stats: {
      ...stats,
      fillRatio: die.w * die.h ? stats.icArea / (die.w * die.h) : 0,
      depthSize: typicalSizeByDepth(blocks),
    },
  };

  /* ------------------------------------------------------------------ internals */

  /** Place one tree node into `rect`. Directories recurse through slice(). */
  function place(node, rect, depth, parentId) {
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    const id = `b${uid++}`;
    const isDir = Array.isArray(node.children);

    if (!isDir) {
      const pkg = node.package || 'SOIC';
      const block = {
        id, parentId, kind: 'ic', depth,
        name: node.name,
        path: node.path || node.name,
        type: TYPE_IC,
        family: node.family || 'misc',
        package: pkg,
        bytes: node.size || 0,
        synthetic: !!node.synthetic,
        count: node.count || 1,
        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
        ports: makePorts(rect, pkg),
      };
      blocks.push(block);
      byId.set(id, block);
      stats.icArea += rect.w * rect.h;
      block.end = blocks.length;
      return block;
    }

    const seal = pick(SEAL, depth);
    const band = pick(LABEL_H, depth);

    // A wide-but-thin label bar on a tall narrow block can hold about three
    // characters. Give such blocks a left-hand band instead and let the name
    // run vertically - the band costs the same area either way.
    const sideways = rect.w < rect.h * LABEL_VERTICAL_RATIO;
    const labelH = sideways ? 0 : band;
    const labelW = sideways ? band : 0;

    const block = {
      id, parentId, kind: 'macro', depth,
      name: node.name,
      path: node.path || node.name,
      type: node.type || TYPE_CORE,
      bytes: node.size || 0,
      childCount: node.children.length,
      seal, labelH, labelW, band,
      labelSide: sideways ? 'left' : 'top',
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    };
    blocks.push(block);
    byId.set(id, block);

    const interior = {
      x: rect.x + seal + labelW,
      y: rect.y + seal + labelH,
      w: rect.w - seal * 2 - labelW,
      h: rect.h - seal * 2 - labelH,
    };
    block.interior = interior;

    // Too small to subdivide: draw it solid rather than emitting slivers.
    if (interior.w < MIN_SIDE * 2 || interior.h < MIN_SIDE * 2 || !node.children.length) {
      block.dense = true;
      stats.culled += node.children.length;
      block.end = blocks.length;
      return block;
    }

    const kids = cull(node.children, interior, block);
    const policy = LAYOUT_POLICY[block.type] || LAYOUT_POLICY[TYPE_CORE];
    slice(kids, interior, depth, 0, policy, id);

    // Index one past this block's last descendant. Blocks are emitted in DFS
    // order and a child is always contained by its parent, so a renderer that
    // finds this block off-screen can jump straight to `end` and skip the whole
    // subtree instead of testing every node in it.
    block.end = blocks.length;
    return block;
  }

  /**
   * Fold children too small to draw into one synthetic "+N more" block, so the
   * die never fills with invisible 1px noise and the DOM stays finite.
   */
  function cull(children, interior, parentBlock) {
    const total = children.reduce((s, c) => s + wOf(c), 0) || 1;
    const area = interior.w * interior.h;

    const kept = [];
    const dropped = [];
    for (const c of children) {
      if (area * (wOf(c) / total) < o.minArea) dropped.push(c);
      else kept.push(c);
    }
    if (!dropped.length) return children;

    if (!kept.length) {
      // Everything is tiny: keep the single heaviest so the block is not empty.
      let best = dropped[0];
      for (const c of dropped) if (wOf(c) > wOf(best)) best = c;
      kept.push(best);
      dropped.splice(dropped.indexOf(best), 1);
      if (!dropped.length) return kept;
    }

    const bytes = dropped.reduce((s, c) => s + (c.size || 0), 0);
    const agg = {
      name: `+${dropped.length} more`,
      path: `${parentBlock.path}/*`,
      size: bytes,
      synthetic: true,
      count: dropped.length,
      family: 'misc',
      package: 'SOT',
    };
    weights.set(agg, dropped.reduce((s, c) => s + wOf(c), 0));
    stats.culled += dropped.length;

    return [...kept, agg];   // always last: deterministic, order-stable
  }

  /**
   * Bisect `rect` between `items`, reserving a routing channel at the cut.
   * `depth` is the owning directory's nesting depth; `cutDepth` counts cuts
   * within that directory (only the alternating policy cares).
   */
  function slice(items, rect, depth, cutDepth, policy, ownerId) {
    if (!items.length) return;
    if (rect.w < MIN_SIDE || rect.h < MIN_SIDE) { stats.culled += items.length; return; }
    if (items.length === 1) { place(items[0], rect, depth + 1, ownerId); return; }

    let axis = chooseAxis(policy, rect, cutDepth);

    // Aspect guard: never let a cut produce a sliver. `force` opts out, because
    // thin columns are exactly the point for memory banks.
    if (policy.mode !== 'force') {
      if (axis === 'V' && (rect.w / 2) / rect.h < MIN_ASPECT) axis = 'H';
      else if (axis === 'H' && rect.w / (rect.h / 2) > 1 / MIN_ASPECT) axis = 'V';
    }

    // Splittability: fall back to the other axis, then give up gracefully.
    const canV = rect.w >= MIN_SIDE * 2 + GRID;
    const canH = rect.h >= MIN_SIDE * 2 + GRID;
    if (axis === 'V' && !canV) axis = 'H';
    else if (axis === 'H' && !canH) axis = 'V';
    if ((axis === 'V' && !canV) || (axis === 'H' && !canH)) {
      let best = items[0];
      for (const c of items) if (wOf(c) > wOf(best)) best = c;
      place(best, rect, depth + 1, ownerId);
      stats.culled += items.length - 1;
      return;
    }

    const span = axis === 'V' ? rect.w : rect.h;
    let ch = pick(CHANNEL, depth);
    if (span - ch < MIN_SIDE * 2) {
      ch = 0;                                   // degrade rather than go negative
      stats.tight++;
      const owner = byId.get(ownerId);
      if (owner) owner.tight = true;
    }

    const k = bestSplit(items);
    const wa = items.slice(0, k).reduce((s, c) => s + wOf(c), 0);
    const wb = items.slice(k).reduce((s, c) => s + wOf(c), 0);

    const usable = span - ch;
    // Snap the CUT, then derive both rectangles from it. Snapping each rect
    // independently is what would leak overlaps and phantom gaps.
    const a = clamp(snap(usable * (wa / (wa + wb) || 0.5)), MIN_SIDE, usable - MIN_SIDE);
    const b = usable - a;

    let rectA, rectB, channel;
    if (axis === 'V') {
      rectA   = { x: rect.x,          y: rect.y, w: a,  h: rect.h };
      channel = { x: rect.x + a,      y: rect.y, w: ch, h: rect.h };
      rectB   = { x: rect.x + a + ch, y: rect.y, w: b,  h: rect.h };
    } else {
      rectA   = { x: rect.x, y: rect.y,          w: rect.w, h: a  };
      channel = { x: rect.x, y: rect.y + a,      w: rect.w, h: ch };
      rectB   = { x: rect.x, y: rect.y + a + ch, w: rect.w, h: b  };
    }

    if (ch > 0) channels.push({ ...channel, axis, depth, ownerId });

    slice(items.slice(0, k), rectA, depth, cutDepth + 1, policy, ownerId);
    slice(items.slice(k),    rectB, depth, cutDepth + 1, policy, ownerId);
  }

  /**
   * Split index minimising |sumA - sumB| over a PREFIX scan, preserving the
   * children's original alphabetical order. Sorting by weight would balance
   * better but would reshuffle the die on every rescan; stability wins.
   */
  function bestSplit(items) {
    const w = items.map(wOf);
    const total = w.reduce((s, v) => s + v, 0);
    let acc = 0, best = 1, bestDiff = Infinity;
    for (let i = 1; i < items.length; i++) {
      acc += w[i - 1];
      const diff = Math.abs(acc - (total - acc));
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return best;
  }
}

/**
 * Collapse single-child directory chains into one block.
 *
 * `app/src/main/java/com/example/tint` is six nested frames carrying six seal
 * rings and six label bars to express one fact. Real floorplans do not spend
 * silicon on that, and neither should we: the chain becomes a single block
 * named for the whole path. Pure - builds new nodes, never mutates the scan.
 */
function collapseChains(node) {
  if (!Array.isArray(node.children)) return node;

  let cur = node;
  const names = [cur.name];
  while (
    Array.isArray(cur.children) &&
    cur.children.length === 1 &&
    Array.isArray(cur.children[0].children)
  ) {
    cur = cur.children[0];
    names.push(cur.name);
  }

  return {
    ...cur,
    name: names.join('/'),
    children: cur.children.map(collapseChains),
  };
}

/**
 * Median short side of the MACRO blocks at each depth.
 *
 * The renderer turns this into a zoom threshold per level: a level resolves
 * when its blocks are physically large enough on screen for their contents to
 * mean anything. Using one figure per depth rather than per block is what lets
 * a whole level come into focus together, the way it does when you change
 * objective on a microscope.
 */
function typicalSizeByDepth(blocks) {
  const byDepth = [];
  for (const b of blocks) {
    if (b.kind !== 'macro') continue;
    (byDepth[b.depth] ||= []).push(Math.min(b.w, b.h));
  }
  return byDepth.map((list) => {
    if (!list || !list.length) return 0;
    const sorted = list.sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  });
}

/** Axis 'V' = vertical cut line, divides WIDTH. 'H' divides HEIGHT. */
function chooseAxis(policy, rect, cutDepth) {
  switch (policy.mode) {
    case 'force':
      return policy.axis;
    case 'alternate': {
      const even = cutDepth % 2 === 0;
      return (policy.start === 'H' ? !even : even) ? 'V' : 'H';
    }
    case 'ribbon':
      return rect.w >= rect.h ? 'H' : 'V';   // cut the SHORT side -> strips
    default:
      return rect.w >= rect.h ? 'V' : 'H';   // squarify: cut the LONG side
  }
}

/**
 * Pin slots on the package edge. Count is derived from the placed rectangle, so
 * a package can never overflow its own block; the package style only decides
 * WHICH sides carry pins. Positions land on the GRID lattice for the router.
 */
function makePorts(rect, pkg) {
  const sides = PKG_SIDES[pkg] || PKG_SIDES.SOIC;
  const max = PKG_MAX_PINS[pkg] || 8;
  const ports = [];

  for (const side of sides) {
    const horiz = side === 'top' || side === 'bottom';
    const len = horiz ? rect.w : rect.h;
    // At least one contact per usable side. The old formula subtracted a pin
    // for the end margins, which zeroed out any side shorter than two pitches -
    // so a 60x12 block had no ports at all, no pads to draw, and nowhere for a
    // trace to land except its centre.
    if (len < PIN_PITCH) continue;
    const n = Math.min(max, Math.max(1, Math.floor(len / PIN_PITCH) - 1));

    const base = horiz ? rect.x : rect.y;
    const run = (n - 1) * PIN_PITCH;
    const start = snap(base + (len - run) / 2);

    for (let i = 0; i < n; i++) {
      const c = clamp(start + i * PIN_PITCH, base, base + len);
      if (side === 'top') ports.push({ x: c, y: rect.y, side });
      else if (side === 'bottom') ports.push({ x: c, y: rect.y + rect.h, side });
      else if (side === 'left') ports.push({ x: rect.x, y: c, side });
      else ports.push({ x: rect.x + rect.w, y: c, side });
    }
  }
  return ports;
}
