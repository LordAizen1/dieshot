#!/usr/bin/env node
/**
 * DIESHOT geometry assertions.
 *
 *   node scanner/verify.js [dir]
 *
 * This is the acceptance test for the claim the whole project rests on: the
 * padding between blocks is a real, reserved, EMPTY routing resource. If any
 * block intrudes into a channel, the router has no legal corridor and
 * this exits non-zero.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDirectory } from './walk.js';
import { collectImports } from './imports.js';
import { createRouter } from '../src/route/router.js';
import { floorplan } from '../src/layout/floorplan.js';
import { CHANNEL, GRID } from '../src/layout/constants.js';
import { WEIGHT_MODE_KEYS } from '../src/layout/weight.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');

const pick = (arr, i) => arr[Math.min(i, arr.length - 1)];

const overlapArea = (a, b) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
};

/** Separation along whichever axis actually separates the two rectangles. */
const gapBetween = (a, b) => {
  const gx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const gy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.max(gx, gy);
};

/** Uniform spatial hash, so the channel-vs-block sweep stays linear-ish. */
function buildIndex(blocks, cell = 128) {
  const map = new Map();
  for (const b of blocks) {
    const x0 = Math.floor(b.x / cell), x1 = Math.floor((b.x + b.w) / cell);
    const y0 = Math.floor(b.y / cell), y1 = Math.floor((b.y + b.h) / cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const k = `${gx},${gy}`;
        let bucket = map.get(k);
        if (!bucket) map.set(k, (bucket = []));
        bucket.push(b);
      }
    }
  }
  return {
    query(r) {
      const out = new Set();
      const x0 = Math.floor(r.x / cell), x1 = Math.floor((r.x + r.w) / cell);
      const y0 = Math.floor(r.y / cell), y1 = Math.floor((r.y + r.h) / cell);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const bucket = map.get(`${gx},${gy}`);
          if (bucket) for (const b of bucket) out.add(b);
        }
      }
      return out;
    },
  };
}

function checkLayout(result, label) {
  const { die, blocks, channels, stats } = result;
  const fails = [];
  const push = (rule, msg) => fails.push({ rule, msg });

  const byId = new Map(blocks.map((b) => [b.id, b]));
  const byParent = new Map();
  for (const b of blocks) {
    const k = b.parentId || '@root';
    let g = byParent.get(k);
    if (!g) byParent.set(k, (g = []));
    g.push(b);
  }

  /* 4. finite, positive, on-lattice ---------------------------------------- */
  for (const b of blocks) {
    for (const key of ['x', 'y', 'w', 'h']) {
      if (!Number.isFinite(b[key])) push('finite', `${b.path} has non-finite ${key}`);
    }
    if (b.w <= 0 || b.h <= 0) push('positive', `${b.path} is ${b.w}x${b.h}`);
    if (b.x % GRID || b.y % GRID || b.w % GRID || b.h % GRID) {
      push('grid', `${b.path} off-lattice: ${b.x},${b.y} ${b.w}x${b.h}`);
    }
  }

  /* 1 + 2 + 3. siblings: no overlap, contained, separated ------------------ */
  let minGap = Infinity;
  for (const [parentId, group] of byParent) {
    const parent = parentId === '@root' ? null : byId.get(parentId);
    const bounds = parent ? parent.interior : { x: 0, y: 0, w: die.w, h: die.h };
    const required = parent ? pick(CHANNEL, parent.depth) : 0;
    const exempt = parent ? !!parent.tight : true;

    for (const b of group) {
      if (b.x < bounds.x || b.y < bounds.y ||
          b.x + b.w > bounds.x + bounds.w || b.y + b.h > bounds.y + bounds.h) {
        push('containment', `${b.path} escapes ${parent ? parent.path : 'the die'}`);
      }
    }

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (overlapArea(a, b) > 0) {
          push('overlap', `${a.path} overlaps ${b.path}`);
          continue;
        }
        const gap = gapBetween(a, b);
        if (gap < minGap) minGap = gap;
        if (!exempt && gap < required) {
          push('channel-width', `${a.path} <-> ${b.path} gap ${gap} < ${required}`);
        }
      }
    }
  }

  /* 5. the corridors are genuinely empty ----------------------------------- */
  const index = buildIndex(blocks);
  for (const ch of channels) {
    if (ch.w <= 0 || ch.h <= 0) { push('channel-shape', `degenerate channel in ${ch.ownerId}`); continue; }
    for (const b of index.query(ch)) {
      // Blocks at or above the owner's depth are ancestors: they legitimately
      // contain the channel. Anything deeper is an intruder.
      if (b.depth <= ch.depth) continue;
      if (overlapArea(ch, b) > 0) {
        push('channel-occupied', `${b.path} sits in a depth-${ch.depth} channel`);
      }
    }
  }

  /* 6. ports on the edge and on the lattice -------------------------------- */
  for (const b of blocks) {
    if (!b.ports) continue;
    for (const p of b.ports) {
      const onEdge =
        (p.x === b.x || p.x === b.x + b.w || p.y === b.y || p.y === b.y + b.h) &&
        p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
      if (!onEdge) push('port-edge', `${b.path} port off-edge at ${p.x},${p.y}`);
      if (p.x % GRID || p.y % GRID) push('port-grid', `${b.path} port off-lattice at ${p.x},${p.y}`);
    }
  }

  const ok = fails.length === 0;
  const head = `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(8)}`;
  console.log(
    `${head} die ${die.w}x${die.h}  blocks ${blocks.length}  channels ${channels.length}` +
    `  fill ${(stats.fillRatio * 100).toFixed(1)}%  minGap ${minGap === Infinity ? '-' : minGap}` +
    `  culled ${stats.culled}  tight ${stats.tight}`
  );

  if (!ok) {
    const byRule = new Map();
    for (const f of fails) byRule.set(f.rule, (byRule.get(f.rule) || 0) + 1);
    for (const [rule, n] of byRule) console.log(`        ${rule}: ${n}`);
    for (const f of fails.slice(0, 8)) console.log(`        - [${f.rule}] ${f.msg}`);
    if (fails.length > 8) console.log(`        ... ${fails.length - 8} more`);
  }
  return ok;
}

/**
 * The routing guarantee: a trace turns only at right angles and never crosses silicon.
 *
 * This is the pay-off for reserving the channels in the first place, so it gets
 * asserted rather than assumed - the same way the corridors themselves are.
 */
function checkRouting(layout, imports, sampleSize = 150) {
  const byPath = new Map(layout.blocks.map((b) => [b.path, b]));
  const solids = layout.blocks.filter((b) => b.kind === 'ic' || b.dense);
  const index = buildIndex(solids);
  const router = createRouter(layout);

  const inside = (px, py, r) =>
    px > r.x + 0.01 && px < r.x + r.w - 0.01 &&
    py > r.y + 0.01 && py < r.y + r.h - 0.01;

  let routed = 0;
  let missing = 0;
  let diagonal = 0;
  let crossings = 0;
  const step = Math.max(1, Math.floor(imports.edges.length / sampleSize));

  for (let i = 0; i < imports.edges.length; i += step) {
    const [fi, ti] = imports.edges[i];
    const a = byPath.get(imports.files[fi]);
    const b = byPath.get(imports.files[ti]);
    if (!a || !b) continue;                    // endpoint culled from the die

    const path = router.route(a, b);
    if (!path) { missing++; continue; }
    routed++;

    for (let k = 1; k < path.length; k++) {
      const [x0, y0] = path[k - 1];
      const [x1, y1] = path[k];
      if (x0 !== x1 && y0 !== y1) diagonal++;

      const steps = Math.ceil((Math.abs(x1 - x0) + Math.abs(y1 - y0)) / 3);
      for (let t = 1; t < steps; t++) {
        const px = x0 + ((x1 - x0) * t) / steps;
        const py = y0 + ((y1 - y0) * t) / steps;
        for (const r of index.query({ x: px, y: py, w: 0, h: 0 })) {
          if (r === a || r === b) continue;
          if (inside(px, py, r)) { crossings++; t = steps; break; }
        }
      }
    }
  }

  const ok = diagonal === 0 && crossings === 0;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  routing  ${routed} traces sampled` +
    `  unroutable ${missing}  diagonal ${diagonal}  crossing-silicon ${crossings}`
  );
  return ok;
}

async function main() {
  const target = process.argv[2] || PROJECT_ROOT;
  const { meta, tree, files } = await scanDirectory(target);
  console.log(`\n  target ${meta.root}  (${meta.fileCount} files, ${meta.dirCount} dirs)\n`);

  let ok = true;
  for (const mode of WEIGHT_MODE_KEYS) {
    ok = checkLayout(floorplan(tree, { weightMode: mode }), mode) && ok;
  }

  // Extreme aspect ratios stress the sliver guards and the tight-channel path.
  for (const aspect of [0.25, 4]) {
    ok = checkLayout(floorplan(tree, { aspect }), `aspect${aspect}`) && ok;
  }

  const imports = await collectImports(meta.root, files);
  if (imports.edges.length) {
    ok = checkRouting(floorplan(tree), imports) && ok;
  } else {
    console.log('SKIP  routing  no import edges in this tree');
  }

  console.log(ok ? '\n  all assertions passed\n' : '\n  ASSERTIONS FAILED\n');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
