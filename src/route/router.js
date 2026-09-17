import { GRID } from '../layout/constants.js';

/**
 * Orthogonal trace routing through the reserved corridors.
 *
 * WHAT IS ROUTABLE. Not just `channels[]`. A channel separates siblings inside
 * one directory, but a block's own seal band - the border between its rect and
 * its interior - sits between a child's channels and the parent's, and a signal
 * leaving a directory has to cross it. Real blocks do exactly this, at pins.
 *
 * So rather than enumerate corridors and seal rings and label bands separately,
 * the router inverts the question: everything is routable EXCEPT the solid
 * blocks, which are the leaves - files, and directories too small to open. That
 * is both simpler and exactly right, because those are the only rectangles the
 * floorplan actually fills.
 *
 * The result is a Manhattan path that never crosses silicon, which is the
 * property the slicing floorplan was chosen for in the first place.
 */

const BLOCKED = 1;

/** Cost of changing direction, in cells. High enough to prefer long straights. */
const TURN_COST = 12;

/** Give up rather than hang. A trace that cannot be routed is not drawn. */
const MAX_EXPANSIONS = 60_000;

/**
 * Weighted A*. Inflating the heuristic makes the search greedy: paths can come
 * out slightly longer than optimal, which for a trace nobody is measuring is a
 * fine trade for the search finishing.
 */
const HEURISTIC_WEIGHT = 1.35;

/** How far outward from a port to look for free space, in cells. */
const ESCAPE_CELLS = 5;

/**
 * Longest span worth attempting, in cells.
 *
 * A* over a 2250-cell-wide die explores an enormous area for a path that spans
 * it, and the result is a trace running off past everything you are looking at.
 * Callers pass a budget derived from the viewport; this is the backstop.
 */
const DEFAULT_MAX_CELLS = 900;

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

/** Binary heap keyed on f-score. */
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const { k, v } = this;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const { k, v } = this;
    const top = v[0];
    const lk = k.pop(); const lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1; const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Rasterize the die into a routability mask at the layout's own lattice pitch,
 * so the grid lines up with the geometry instead of approximating it.
 */
function buildRouteGrid(layout, cell = GRID) {
  const w = Math.ceil(layout.die.w / cell) + 1;
  const h = Math.ceil(layout.die.h / cell) + 1;
  const data = new Uint8Array(w * h);

  for (const b of layout.blocks) {
    // Only leaves are solid. A directory with children is mostly corridor.
    if (b.kind !== 'ic' && !b.dense) continue;
    const x0 = Math.max(0, Math.floor(b.x / cell));
    const x1 = Math.min(w - 1, Math.ceil((b.x + b.w) / cell));
    const y0 = Math.max(0, Math.floor(b.y / cell));
    const y1 = Math.min(h - 1, Math.ceil((b.y + b.h) / cell));
    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = x0; x <= x1; x++) data[row + x] = BLOCKED;
    }
  }

  return { w, h, cell, data };
}

const NORMAL = {
  left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1],
};

/**
 * The free cell a port escapes into, found by stepping straight out along the
 * edge the port sits on.
 *
 * The earlier version spiralled outward for the NEAREST free cell in any
 * direction. In a densely packed region that cell can be on the far side of a
 * neighbouring block, and the stub drawn to it jumps clean over that block -
 * which is how traces ended up crossing silicon. Leaving along the port's own
 * normal is both what a pin does and the only direction guaranteed to be
 * leaving this block rather than entering someone else's.
 */
function escapeCell(grid, port) {
  const { w, h, cell, data } = grid;
  const [nx, ny] = NORMAL[port.side] || [1, 0];
  for (let k = 1; k <= ESCAPE_CELLS; k++) {
    const x = Math.round((port.x + nx * cell * k) / cell);
    const y = Math.round((port.y + ny * cell * k) / cell);
    if (x < 0 || y < 0 || x >= w || y >= h) return -1;
    if (!data[y * w + x]) return y * w + x;
  }
  return -1;
}

/**
 * Final safety net: walk the polyline and confirm it never enters a blocked
 * cell outside its own endpoints. Drawing no trace is better than drawing one
 * that lies about the floorplan.
 */
function isClear(grid, pts, a, b) {
  const { w, cell, data } = grid;
  const within = (r, px, py) =>
    px >= r.x - cell && px <= r.x + r.w + cell &&
    py >= r.y - cell && py <= r.y + r.h + cell;

  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const steps = Math.max(1, Math.round((Math.abs(x1 - x0) + Math.abs(y1 - y0)) / cell));
    for (let t = 0; t <= steps; t++) {
      const px = x0 + ((x1 - x0) * t) / steps;
      const py = y0 + ((y1 - y0) * t) / steps;
      const cx = Math.round(px / cell);
      const cy = Math.round(py / cell);
      if (data[cy * w + cx] && !within(a, px, py) && !within(b, px, py)) return false;
    }
  }
  return true;
}

/**
 * A* over (cell, direction) states. Direction is part of the state so a turn
 * can be charged properly - without it the path staircases, which is exactly
 * what an orthogonal floorplan is supposed to avoid.
 */
function search(grid, startCell, goalCell) {
  const { w, h, data } = grid;
  const gx = goalCell % w; const gy = (goalCell / w) | 0;
  const heur = (c) => Math.abs((c % w) - gx) + Math.abs(((c / w) | 0) - gy);

  const best = new Map();       // state -> g
  const from = new Map();       // state -> previous state
  const open = new Heap();

  for (let d = 0; d < 4; d++) {
    const st = startCell * 4 + d;
    best.set(st, 0);
    open.push(heur(startCell) * HEURISTIC_WEIGHT, st);
  }

  let expansions = 0;
  while (open.size) {
    const st = open.pop();
    const cell = (st / 4) | 0;
    const dir = st % 4;
    if (cell === goalCell) return { state: st, from };
    if (++expansions > MAX_EXPANSIONS) return null;

    const g = best.get(st);
    const x = cell % w; const y = (cell / w) | 0;

    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DX[nd]; const ny = y + DY[nd];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ncell = ny * w + nx;
      if (data[ncell]) continue;

      const ng = g + 1 + (nd === dir ? 0 : TURN_COST);
      const nst = ncell * 4 + nd;
      const prev = best.get(nst);
      if (prev !== undefined && prev <= ng) continue;
      best.set(nst, ng);
      from.set(nst, st);
      open.push(ng + heur(ncell) * HEURISTIC_WEIGHT, nst);
    }
  }
  return null;
}

/** Walk the came-from chain back and collapse runs into corner points. */
function toPolyline(grid, result, startCell) {
  const { w, cell } = grid;
  const cells = [];
  let st = result.state;
  while (st !== undefined) {
    cells.push((st / 4) | 0);
    st = result.from.get(st);
  }
  cells.reverse();
  if (cells[0] !== startCell) cells.unshift(startCell);

  const pts = [];
  for (let i = 0; i < cells.length; i++) {
    const x = (cells[i] % w) * cell;
    const y = (((cells[i] / w) | 0)) * cell;
    if (i === 0 || i === cells.length - 1) { pts.push([x, y]); continue; }
    const px = (cells[i - 1] % w) * cell;
    const py = (((cells[i - 1] / w) | 0)) * cell;
    const nx = (cells[i + 1] % w) * cell;
    const ny = (((cells[i + 1] / w) | 0)) * cell;
    // Keep only the corners: a point where the direction changes.
    if ((px === x && nx === x) || (py === y && ny === y)) continue;
    pts.push([x, y]);
  }
  return pts;
}

/**
 * Drop duplicate and collinear points.
 *
 * The router emits corners, but stitching the real port positions onto the ends
 * can introduce a redundant vertex; this leaves a minimal polyline.
 */
function tidy(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const [ax, ay] = out[i - 1];
    const [bx, by] = out[i];
    const [cx, cy] = out[i + 1];
    if ((ax === bx && bx === cx) || (ay === by && by === cy)) out.splice(i, 1);
  }
  return out;
}

/**
 * Orthogonal stub from a port to the first routed point.
 *
 * A pin leaves its block perpendicular to the edge it sits on - which is both
 * what a real pin does and, conveniently, the direction with guaranteed free
 * space, since that is where the router found its entry cell.
 */
function stub(port, to) {
  if (port.side === 'top' || port.side === 'bottom') return [port.x, to[1]];
  return [to[0], port.y];
}

const MAX_PORT_TRIES = 2;

/** Port pairs between two blocks, closest first. */
function endpointCandidates(a, b) {
  const fallback = (r) => [{ x: r.x + r.w / 2, y: r.y + r.h / 2, side: 'right' }];
  const ap = a.ports?.length ? a.ports : fallback(a);
  const bp = b.ports?.length ? b.ports : fallback(b);

  const pairs = [];
  for (const p of ap) {
    for (const q of bp) {
      pairs.push([Math.abs(p.x - q.x) + Math.abs(p.y - q.y), p, q]);
    }
  }
  pairs.sort((x, y) => x[0] - y[0]);
  return pairs.slice(0, MAX_PORT_TRIES).map(([, p, q]) => [p, q]);
}

export function createRouter(layout) {
  let grid = null;
  const cache = new Map();

  return {
    /** Lazily rasterized: nothing is paid unless traces are actually shown. */
    get grid() {
      if (!grid) grid = buildRouteGrid(layout);
      return grid;
    },

    route(a, b, { maxCells = DEFAULT_MAX_CELLS } = {}) {
      const key = `${a.id}>${b.id}`;
      if (cache.has(key)) return cache.get(key);

      const g = this.grid;
      let path = null;

      // Reject hopeless spans before rasterizing or searching anything.
      const span = (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / g.cell;
      if (span > maxCells) { cache.set(key, null); return null; }

      // Try the closest port pairs first; a port boxed in by a neighbour simply
      // has no escape, so fall through to the next candidate rather than
      // forcing a path that would cut through something.
      for (const [pa, pb] of endpointCandidates(a, b)) {
        const start = escapeCell(g, pa);
        const goal = escapeCell(g, pb);
        if (start < 0 || goal < 0) continue;

        const res = search(g, start, goal);
        if (!res) continue;

        const mid = toPolyline(g, res, start);
        const pts = tidy([
          [pa.x, pa.y],
          stub(pa, mid[0]),
          ...mid,
          stub(pb, mid[mid.length - 1]),
          [pb.x, pb.y],
        ]);
        if (!isClear(g, pts, a, b)) continue;
        path = pts;
        break;
      }

      cache.set(key, path);
      return path;
    },
  };
}
