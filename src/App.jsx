import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { floorplan } from './layout/floorplan.js';
import { THEMES, THEME_KEYS } from './render/theme.js';
import ChipCanvas from './render/ChipCanvas.jsx';
import Hud from './ui/Hud.jsx';
import Tooltip from './ui/Tooltip.jsx';
import Empty from './ui/Empty.jsx';
import { TECH, MONO } from './render/fonts.js';

export default function App() {
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(null);

  const [themeKey, setThemeKey] = useState('silicon');
  const [weightMode, setWeightMode] = useState('sqrt');
  const [showChannels, setShowChannels] = useState(false);
  const [showTraces, setShowTraces] = useState(true);
  const [hudShown, setHudShown] = useState(true);

  const [hover, setHover] = useState(null);
  const [fitSignal, setFitSignal] = useState(0);

  const theme = THEMES[themeKey];

  /**
   * `quiet` is for the boot load. On a fresh clone there is no die.json yet,
   * and the dev server answers a missing file with index.html rather than a
   * 404, so the fetch succeeds and JSON.parse chokes on "<!doctype". That is
   * not an error worth showing someone on their very first run: they just
   * have not scanned anything yet.
   */
  const load = useCallback(async (url, label, { quiet = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${res.status} ${res.statusText}`);
      }
      if (!res.headers.get('content-type')?.includes('json')) {
        throw new Error('no scan found');
      }
      const json = await res.json();
      if (!json?.tree) throw new Error('malformed scan: no tree');
      setScan(json);
      setFitSignal((n) => n + 1);
    } catch (e) {
      if (!quiet) setError(`${label}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load('/die.json', 'load die.json', { quiet: true }).catch(() => {});
  }, [load]);

  const rescan = useCallback(
    (path) => load(`/api/scan?path=${encodeURIComponent(path)}`, 'scan'),
    [load],
  );

  // Layout is pure and cheap enough to run synchronously on every option change.
  const layout = useMemo(
    () => (scan ? floorplan(scan.tree, { weightMode }) : null),
    [scan, weightMode],
  );

  const byId = useMemo(
    () => new Map((layout?.blocks ?? []).map((b) => [b.id, b])),
    [layout],
  );

  /**
   * The netlist, resolved onto blocks.
   *
   * Edges reference files by index; a file may have been culled from the die,
   * in which case it has no block and the edge simply has nowhere to land.
   */
  const netlist = useMemo(() => {
    if (!scan?.imports || !layout) return null;
    const { files, edges } = scan.imports;
    const byPath = new Map(layout.blocks.map((b) => [b.path, b]));

    /*
     * A file does not always get its own block. Small directories are drawn
     * solid rather than subdivided, so their contents are never placed, and
     * looking those paths up returned nothing. Every edge touching one was
     * quietly thrown away, which is why traces sometimes just were not there.
     *
     * Walk up the path instead: shared/types.js lands on the shared block.
     */
    const resolve = (p) => {
      let key = p;
      for (;;) {
        const hit = byPath.get(key);
        if (hit) return hit;
        const cut = key.lastIndexOf('/');
        if (cut < 0) return null;
        key = key.slice(0, cut);
      }
    };
    const memo = new Map();
    const blockFor = (p) => {
      if (memo.has(p)) return memo.get(p);
      const b = resolve(p);
      memo.set(p, b);
      return b;
    };

    const out = new Map();
    const inn = new Map();
    const add = (map, key, val) => {
      let list = map.get(key);
      if (!list) map.set(key, (list = []));
      list.push(val);
    };
    let live = 0;
    for (const [fi, ti] of edges) {
      const a = blockFor(files[fi]);
      const b = blockFor(files[ti]);
      if (!a || !b || a === b) continue;
      add(out, a.id, b);
      add(inn, b.id, a);
      live++;
    }
    return { out, inn, live, total: edges.length };
  }, [scan, layout]);

  // Only re-render on ENTER/EXIT of a block, not on every pointer move.
  const hoverId = useRef(null);
  const onHover = useCallback((id, x, y) => {
    if (id === hoverId.current) return;
    hoverId.current = id;
    setHover(id ? { id, x, y } : null);
  }, []);

  const hoverBlock = hover ? byId.get(hover.id) ?? null : null;

  const cycleTheme = useCallback(() => {
    setThemeKey((k) => THEME_KEYS[(THEME_KEYS.indexOf(k) + 1) % THEME_KEYS.length]);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'f') setFitSignal((n) => n + 1);
      else if (e.key === 't') cycleTheme();
      else if (e.key === 'c') setShowChannels((v) => !v);
      else if (e.key === 'h') setHudShown((v) => !v);
      else if (e.key === 'r') setShowTraces((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleTheme]);

  useEffect(() => {
    document.body.style.background = theme.page;
  }, [theme]);

  // Publish the font stacks from JS so canvas measurement and CSS cannot drift.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--tech', TECH);
    root.setProperty('--mono', MONO);
  }, []);

  return (
    <div className="app">
      {layout ? (
        <ChipCanvas
          layout={layout}
          meta={scan.meta}
          theme={theme}
          showChannels={showChannels}
          netlist={showTraces ? netlist : null}
          hoverBlock={hoverBlock}
          onHover={onHover}
          fitSignal={fitSignal}
        />
      ) : (
        <Empty theme={theme} busy={busy} onScan={rescan} />
      )}

      <Hud
        meta={scan?.meta}
        layout={layout}
        theme={theme}
        onTheme={cycleTheme}
        weightMode={weightMode}
        onWeightMode={setWeightMode}
        showChannels={showChannels}
        onChannels={setShowChannels}
        showTraces={showTraces}
        onTraces={setShowTraces}
        netlist={netlist}
        onScan={rescan}
        onFit={() => setFitSignal((n) => n + 1)}
        busy={busy}
        error={error}
        shown={hudShown}
        onShown={setHudShown}
      />

      {hoverBlock && (
        <Tooltip block={hoverBlock} x={hover.x} y={hover.y} theme={theme} />
      )}
    </div>
  );
}
