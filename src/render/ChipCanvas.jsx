import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useViewport } from '../hooks/useViewport.js';
import Patterns from './patterns.jsx';
import Die from './Die.jsx';
import MacroBlock from './MacroBlock.jsx';
import ICBlock from './ICBlock.jsx';
import Channels from './Channels.jsx';
import Readout from '../ui/Readout.jsx';
import Traces from './Traces.jsx';
import { createRouter } from '../route/router.js';
import { PAD_RING, OPEN_PX, REVEAL_BAND, MAX_BLUR } from '../layout/constants.js';
import { variantOf } from './color.js';

/** Below this many screen pixels a block is not worth a DOM node. */
const MIN_VISIBLE_PX = 1.6;

/** World-space quantum for the cull rectangle: pan this far before recomputing. */
const CULL_QUANTUM = 256;

/**
 * Hard ceiling on drawn blocks. SVG buys crisp text and free hit-testing; the
 * price is that a zoom re-rasterizes every live node. Rather than let a huge
 * repo degrade without limit, raise the visibility threshold until the scene
 * fits the budget - the smallest blocks drop out first.
 */
/**
 * Budget in estimated DOM NODES, not blocks.
 *
 * Counting blocks budgets the wrong quantity: a macro carries a rect, a band, a
 * label, a tag and often an annotation, while an interior cell is a single
 * rect. 1,800 blocks measured at 8,500 nodes - well inside a 2,000-block budget
 * and well outside what stays smooth. These weights are rough on purpose; what
 * matters is that a macro costs several times a cell.
 */
const NODE_BUDGET = 6000;
const COST_MACRO = 8;   // rect + band + name + tag + annotation + chrome
const COST_IC = 4;      // rect + cavity + label
const COST_CELL = 1;    // a bare rect, which is the whole point of cells

/**
 * Above this many elements a transition layer fades without defocusing. A CSS
 * blur rasterizes the group's whole bounding box offscreen, so the cost scales
 * with both element count and area; past a point the focus pull is not worth
 * what it does to the frame.
 */
const BLUR_MAX_ELS = 600;

/** Most traces drawn for one block; beyond this it stops being readable. */
const TRACE_LIMIT = 40;

/** Cap on how much of a folder's subtree to walk when rolling up its imports. */
const SUBTREE_SCAN = 4000;

const LOD_STEPS = [MIN_VISIBLE_PX, 3, 5, 8, 13, 21];

/**
 * Transition buckets. A block's fade-in is driven by how far its PARENT has
 * opened, so blocks sharing a parent share a progress value. Quantising that
 * into a handful of buckets means the focus-pull blur applies to a few groups
 * rather than thousands of elements - a CSS filter on one <g> costs one
 * offscreen rasterization, the same filter on 2000 elements costs 2000.
 */
const BUCKETS = 6;


/**
 * Smallest sub-cell worth drawing, in screen px.
 *
 * A closed block is not featureless: a real macro shows its sub-banks long
 * before you can read them. The engine has already placed every descendant, so
 * one more generation is rendered as flat tonal cells - no labels, no rims,
 * just the shapes. That makes a directory's interior its ACTUAL module layout
 * rather than a texture, and no two directories look alike because no two
 * directories contain the same thing.
 */
const MIN_CELL_PX = 7;

const lodScale = (s) => 2 ** (Math.floor(Math.log2(s) * 4) / 4);

const smoothstep = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/**
 * How far a block has opened, from its apparent size on screen.
 *
 * sqrt(area) rather than the short side: a 1000x60 strip has plenty of room
 * for children even though it is thin, and judging it by its short side would
 * keep it shut forever.
 */
const openProgress = (apparentPx) =>
  smoothstep((apparentPx / OPEN_PX - 1) / (REVEAL_BAND - 1));

/** Flat tone for an interior cell - its own type colour, no texture. */
function toneOf(b, theme) {
  const src = b.kind === 'macro'
    ? theme.types[b.type] || theme.types.TYPE_CORE
    : theme.families[b.family] || theme.families.misc;
  return src.tints[variantOf(b.path)];
}

const Macro = memo(MacroBlock);
const IC = memo(ICBlock);
const DieChrome = memo(Die);

/**
 * Hover is drawn as ONE overlay rectangle rather than a prop on every block.
 * A per-block `hovered` prop would invalidate the memoized element arrays on
 * every pointer move, which is exactly the cost this file exists to avoid.
 */
function HoverOutline({ b, theme }) {
  if (!b) return null;
  return (
    <rect
      x={b.x} y={b.y} width={b.w} height={b.h}
      fill="none" stroke={theme.accent} strokeWidth="2"
      vectorEffect="non-scaling-stroke" pointerEvents="none"
    />
  );
}

export default function ChipCanvas({
  layout, meta, theme, showChannels, netlist, hoverBlock, onHover, fitSignal,
}) {
  const ref = useRef(null);
  const reuseRef = useRef({ buckets: null, cellBuckets: null });
  const cellElCache = useRef({ theme: null, map: new WeakMap() });
  const { view, fit, size, dragging, fitScale } = useViewport(ref, layout.die);

  useEffect(() => { if (fitSignal) fit(); }, [fitSignal, fit]);

  const lod = lodScale(view.s);

  /**
   * Quantize the cull rectangle so panning does not invalidate this memo on
   * every pointer move - only after CULL_QUANTUM of travel.
   *
   * In SCREEN space, not world space. A fixed world quantum is a colossal
   * margin once you are zoomed in: at 8x, 256 world units is 2048 screen px,
   * so the cull region was several times the visible area and everything in it
   * was being drawn. Dividing by the (quantized) scale keeps the margin a
   * constant number of screen pixels at every zoom.
   */
  const q = CULL_QUANTUM / lod;
  const vx = Math.floor((-view.x / view.s) / q) * q - q;
  const vy = Math.floor((-view.y / view.s) / q) * q - q;
  const vw = Math.ceil((size.w / view.s) / q) * q + q * 2;
  const vh = Math.ceil((size.h / view.s) / q) * q + q * 2;

  /**
   * Semantic zoom. A block is drawn only once its parent has begun to open, so
   * the die starts as a handful of annotated macros and resolves into folders
   * and files as you magnify - rather than showing every level at once and
   * leaving the reader to ignore most of it.
   */
  const { buckets, cellBuckets, closedIds, visibleChannels, deepest, drawnIds } = useMemo(() => {
    const blocks = layout.blocks;
    const root = blocks[0];
    const inView = (r) =>
      r.x <= vx + vw && r.y <= vy + vh && r.x + r.w >= vx && r.y + r.h >= vy;

    let groups = [];
    let cells = [];
    let closed = new Set();
    let progress = new Map();
    let drawnIds = new Map();
    let deepest = 0;

    for (const minPx of LOD_STEPS) {
      groups = Array.from({ length: BUCKETS }, () => []);
      cells = Array.from({ length: BUCKETS }, () => []);
      closed = new Set();
      deepest = 0;
      let cost = 0;

      // progress: set for a macro only once it is drawn AND open, so openness
      // is computed for the handful of blocks on screen rather than all 40,000.
      // bucketOf: set for everything that made it onto the canvas, cells too.
      progress = new Map();
      const bucketOf = new Map();
      if (root) { progress.set(root.id, 1); bucketOf.set(root.id, BUCKETS - 1); }

      const cellPx = Math.max(MIN_CELL_PX, minPx);

      for (let i = 1; i < blocks.length;) {
        const b = blocks[i];

        /*
         * Subtree pruning. Blocks are emitted depth-first and a child is always
         * contained by its parent, so if the parent never made it onto the
         * canvas - or this block is off-screen - every descendant is too, and
         * `end` jumps straight past the lot. That turns the pass from "touch
         * every block in the repo" into "touch what is nearly visible".
         */
        if (!bucketOf.has(b.parentId) || !inView(b)) { i = b.end; continue; }

        const alpha = progress.get(b.parentId) ?? 0;
        let bucket = -1;

        if (alpha > 0) {
          if (b.w * lod >= minPx && b.h * lod >= minPx) {
            // Bucket 0 is fully transparent: drawing it would cost a blur pass
            // and a subtree for something nobody can see.
            const k = Math.min(BUCKETS - 1, Math.round(alpha * (BUCKETS - 1)));
            if (k >= 1) {
              groups[k].push(b);
              bucket = k;
              cost += b.kind === 'macro' ? COST_MACRO : COST_IC;
            }
          }
        } else if (Math.sqrt(b.w * b.h) * lod >= cellPx) {
          // Parent is on the canvas but closed, so this is interior structure.
          bucket = bucketOf.get(b.parentId);
          cells[bucket].push(b);
          cost += COST_CELL;
        }

        if (bucket < 0) { i = b.end; continue; }

        bucketOf.set(b.id, bucket);
        if (b.depth > deepest) deepest = b.depth;

        if (b.kind === 'macro' && alpha > 0) {
          const p = openProgress(Math.sqrt(b.w * b.h) * lod);
          progress.set(b.id, p);
          if (p < 0.5) closed.add(b.id);
        }
        i++;
      }

      drawnIds = bucketOf;
      if (cost <= NODE_BUDGET) break;
    }

    const visibleChannels = showChannels
      ? layout.channels.filter((c) => (progress.get(c.ownerId) ?? 0) > 0.5 && inView(c))
      : [];

    /*
     * Hand back the PREVIOUS arrays when a pass produces identical contents.
     *
     * Crossing an LOD step re-runs this pass, but most of what it finds is
     * unchanged - especially the cells, whose membership only moves when a
     * block crosses the size threshold. Comparing 2,000 references costs
     * microseconds; letting React reconcile 2,000 rebuilt <rect>s costs tens of
     * milliseconds, which is what a zoom hitch is made of.
     */
    const cache = reuseRef.current;
    const stable = (next, old) => {
      if (!old || old.length !== next.length) return next;
      let allSame = true;
      const out = next.map((arr, i) => {
        const o = old[i];
        if (o && o.length === arr.length && arr.every((v, j) => v === o[j])) return o;
        allSame = false;
        return arr;
      });
      return allSame ? old : out;
    };
    const outBuckets = stable(groups, cache.buckets);
    const outCells = stable(cells, cache.cellBuckets);
    cache.buckets = outBuckets;
    cache.cellBuckets = outCells;

    return {
      buckets: outBuckets, cellBuckets: outCells,
      closedIds: closed, visibleChannels, deepest, drawnIds,
    };
  }, [layout, vx, vy, vw, vh, lod, showChannels]);

  /**
   * Memoize the ELEMENT ARRAYS, not just the components. memo() skips a
   * component's body but React still allocates and diffs every element; at
   * ~2800 blocks that alone costs ~65ms a frame. Holding the arrays
   * referentially stable lets React skip the subtree wholesale.
   */
  /*
   * Cells are memoized WITHOUT `lod`. A cell is a flat rect that makes no
   * level-of-detail decision, so its markup depends only on which cells are on
   * screen and the palette - and cells outnumber blocks roughly twenty to one.
   * Keeping them off the lod dependency means a zoom step rebuilds the hundred
   * blocks that actually changed, not the two thousand rects that did not.
   */
  const cellEls = useMemo(() => {
    // Keyed on the bucket ARRAY, whose identity the cull preserves when its
    // contents are unchanged. Mapping over all buckets and rebuilding each one
    // meant a single bucket shifting re-created every rect on the die.
    const cache = cellElCache.current;
    if (cache.theme !== theme) { cache.theme = theme; cache.map = new WeakMap(); }
    return cellBuckets.map((group) => {
      if (!group.length) return null;
      const hit = cache.map.get(group);
      if (hit) return hit;
      const els = (
        <g key="cells" opacity="0.42">
          {group.map((b) => (
            <rect key={b.id} x={b.x} y={b.y} width={b.w} height={b.h} fill={toneOf(b, theme)} />
          ))}
        </g>
      );
      cache.map.set(group, els);
      return els;
    });
  }, [cellBuckets, theme]);

  const blockEls = useMemo(() => buckets.map((group) => group.map((b) => (
    b.kind === 'macro'
      ? <Macro key={b.id} b={b} theme={theme} scale={lod} closed={closedIds.has(b.id)} />
      : <IC key={b.id} b={b} theme={theme} scale={lod} />
  ))), [buckets, closedIds, theme, lod]);

  const layers = useMemo(() => buckets.map((group, i) => {
    const cellGroup = cellBuckets[i] || [];
    if (!group.length && !cellGroup.length) return null;
    const v = i / (BUCKETS - 1);
    const heavy = group.length + cellGroup.length > BLUR_MAX_ELS;
    return {
      key: i,
      opacity: v ** 0.75,
      blur: heavy ? 0 : (1 - v) * MAX_BLUR,
      // Cells last within the layer: they sit inside their closed parent, which
      // is drawn in this same layer.
      els: [blockEls[i], cellEls[i]],
    };
  }), [buckets, cellBuckets, blockEls, cellEls]);

  /**
   * Routing is lazy and cached: the grid is only rasterized the first time a
   * trace is actually asked for, and each path is computed once. Traces are
   * shown for the hovered block rather than for the whole netlist, because
   * drawing forty thousand edges at once is precisely the hairball this
   * project exists to avoid.
   */
  const router = useMemo(() => createRouter(layout), [layout]);

  const blockIndex = useMemo(
    () => new Map(layout.blocks.map((b, i) => [b.id, i])),
    [layout],
  );

  /**
   * Traces for whatever is under the cursor.
   *
   * Imports are a file-to-file thing, but files only exist as blocks once you
   * are zoomed well in, so tracing only files meant the feature was invisible
   * at the view everyone actually starts on. Hovering a FOLDER now rolls up
   * every import crossing its boundary and draws it against whichever blocks
   * are currently on screen. Hover src, see what src depends on.
   */
  const tracePaths = useMemo(() => {
    if (!netlist || !hoverBlock) return [];

    const blocks = layout.blocks;
    const i0 = blockIndex.get(hoverBlock.id);
    if (i0 === undefined) return [];
    const end = hoverBlock.end ?? i0 + 1;

    // Anything inside the hovered block is internal wiring, not a dependency
    // of it, so those edges are skipped rather than drawn.
    const inside = (b) => {
      const i = blockIndex.get(b.id);
      return i !== undefined && i >= i0 && i < end;
    };

    // Walk up to whatever ancestor is actually being drawn right now.
    const onScreen = (b) => {
      let cur = b;
      while (cur && !drawnIds.has(cur.id)) cur = blocks[blockIndex.get(cur.parentId)] ?? null;
      return cur;
    };

    const collect = (dir) => {
      const seen = new Map();
      let scanned = 0;
      for (let i = i0; i < end && seen.size < TRACE_LIMIT && scanned < SUBTREE_SCAN; i++) {
        scanned++;
        const targets = netlist[dir].get(blocks[i].id);
        if (!targets) continue;
        for (const t of targets) {
          if (inside(t)) continue;                 // internal to what we hover
          const vis = onScreen(t);
          if (!vis || vis === hoverBlock || seen.has(vis.id)) continue;
          if (vis.x > vx + vw || vis.y > vy + vh
              || vis.x + vis.w < vx || vis.y + vis.h < vy) continue;
          seen.set(vis.id, vis);
        }
      }
      return [...seen.values()];
    };

    const maxCells = (vw + vh) / 4;
    const paths = [];
    const add = (targets, color, tag) => {
      for (const t of targets) {
        const pts = router.route(hoverBlock, t, { maxCells });
        if (pts && pts.length > 1) paths.push({ key: `${tag}${t.id}`, pts, color });
      }
    };
    add(collect('out'), theme.traceOut, 'o');
    add(collect('inn'), theme.traceIn, 'i');
    return paths;
  }, [netlist, hoverBlock, router, theme, vx, vy, vw, vh, layout, blockIndex, drawnIds]);

  const handleMove = useCallback((e) => {
    const el = e.target.closest?.('[data-id]');
    const id = el ? el.getAttribute('data-id') : null;
    onHover?.(id, e.clientX, e.clientY);
  }, [onHover]);

  const handleLeave = useCallback(() => onHover?.(null, 0, 0), [onHover]);

  // Quantized, so Die's memo only breaks when the cull region actually moves.
  const cullRect = useMemo(() => ({ x: vx, y: vy, w: vw, h: vh }), [vx, vy, vw, vh]);

  const core = {
    x: PAD_RING,
    y: PAD_RING,
    width: Math.max(0, layout.die.w - PAD_RING * 2),
    height: Math.max(0, layout.die.h - PAD_RING * 2),
  };

  const drawn = buckets.reduce((n, g) => n + g.length, 0);
  const cellCount = cellBuckets.reduce((n, g) => n + g.length, 0);

  return (
    <div
      ref={ref}
      className="canvas"
      style={{ background: theme.page, cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <svg
        width="100%" height="100%"
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        <Patterns theme={theme} />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.s})`}>
          <DieChrome
            die={layout.die} theme={theme} meta={meta}
            stats={layout.stats} scale={lod} root={layout.blocks[0]}
            view={cullRect}
          />

          {/*
            CMP dummy fill, laid across the whole core and then covered by the
            opaque blocks - so it shows through precisely in the gaps, which is
            where a real process puts it. One node for the entire die.
          */}
          <rect {...core} fill="url(#pat-fill)" opacity="0.5" />

          {showChannels && (
            <Channels channels={visibleChannels} theme={theme} />
          )}

          {/*
            Sharpest layer first: a child is always less far along than its
            parent, so descending bucket order puts parents behind children.
          */}
          <g opacity={showChannels ? 0.4 : 1}>
            {layers.slice().reverse().map((layer) => layer && (
              <g
                key={layer.key}
                opacity={layer.opacity}
                style={layer.blur > 0.05
                  ? { filter: `blur(${layer.blur.toFixed(1)}px)` }
                  : undefined}
              >
                {layer.els}
              </g>
            ))}
          </g>

          {/*
            Top-metal power grid. It sits ABOVE the blocks because that is where
            it is physically: the last metal layer runs over everything, and the
            way it crosses block boundaries unbroken is what makes a die photo
            read as one piece of silicon rather than a stack of rectangles.
          */}
          <rect
            {...core} fill="url(#pat-power)"
            opacity={showChannels ? 0.07 : 0.19} pointerEvents="none"
          />

          {/* Uneven illumination, the last thing between you and a photograph. */}
          <rect
            x={0} y={0} width={layout.die.w} height={layout.die.h}
            fill="url(#die-light)" pointerEvents="none"
          />

          <Traces paths={tracePaths} theme={theme} scale={view.s} />

          <HoverOutline b={hoverBlock} theme={theme} />
        </g>
      </svg>

      <Readout
        scale={view.s}
        fitScale={fitScale}
        theme={theme}
        drawn={drawn}
        cells={cellCount}
        total={layout.blocks.length}
        deepest={deepest}
      />
    </div>
  );
}
