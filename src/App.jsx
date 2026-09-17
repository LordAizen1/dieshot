import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { floorplan } from './layout/floorplan.js';
import { THEMES, THEME_KEYS } from './render/theme.js';
import ChipCanvas from './render/ChipCanvas.jsx';
import Hud from './ui/Hud.jsx';
import Tooltip from './ui/Tooltip.jsx';
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

  const load = useCallback(async (url, label) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${res.status} ${res.statusText}`);
      }
      const json = await res.json();
      if (!json?.tree) throw new Error('malformed scan: no tree');
      setScan(json);
      setFitSignal((n) => n + 1);
    } catch (e) {
      setError(`${label}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load('/die.json', 'load die.json').catch(() => {});
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
    const out = new Map();
    const inn = new Map();
    const add = (map, key, val) => {
      let list = map.get(key);
      if (!list) map.set(key, (list = []));
      list.push(val);
    };
    let live = 0;
    for (const [fi, ti] of edges) {
      const a = byPath.get(files[fi]);
      const b = byPath.get(files[ti]);
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
        <div className="empty" style={{ color: theme.dim, background: theme.page }}>
          {busy ? 'SCANNING…' : (
            <>
              <div>NO DIE LOADED</div>
              <div className="empty-hint">
                run <code>npm run scan -- {'<dir>'}</code>, or type a path above and hit SCAN
              </div>
            </>
          )}
        </div>
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
