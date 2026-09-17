import { useState } from 'react';
import { WEIGHT_MODE_KEYS, WEIGHT_MODE_HELP } from '../layout/weight.js';
import { MACRO_TYPES, TYPE_LABEL } from '../../shared/types.js';

const fmtBytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)}${u[i]}`;
};

function Stat({ k, v }) {
  return (
    <div className="stat">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

/**
 * A vertical instrument rail.
 *
 * Everything used to sit in horizontal rows - eight figures, a select, four
 * buttons and a six-item legend all competing at once, across a slab wide
 * enough to cover a quarter of the die. Now it reads top to bottom, shows the
 * three figures worth watching and the three controls worth reaching for, and
 * keeps the rest behind a disclosure. It also collapses entirely, because the
 * point of the tool is the thing underneath it.
 */
export default function Hud({
  meta, layout, theme, onTheme,
  weightMode, onWeightMode, showChannels, onChannels,
  showTraces, onTraces, netlist,
  onScan, onFit, busy, error,
  shown, onShown,
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState('');
  const s = layout?.stats;

  const vars = { '--ink': theme.text, '--dim': theme.dim, '--accent': theme.accent };

  if (!shown) {
    return (
      <button className="hud-peek" style={vars} onClick={() => onShown(true)} title="show panel (h)">
        DIESHOT
      </button>
    );
  }

  return (
    <aside className="hud" style={vars}>
      <header className="hud-head">
        <span className="hud-mark">DIESHOT</span>
        <button className="hud-icon" onClick={() => onShown(false)} title="hide panel (h)">−</button>
      </header>

      <div className="hud-target" title={meta?.root || ''}>
        {busy ? 'scanning…' : (meta?.name ?? 'no die loaded')}
      </div>

      {error && <div className="hud-error">{error}</div>}

      {/* A truncated scan looks like a complete die unless you say otherwise. */}
      {meta?.truncated && (
        <div className="hud-note">
          partial scan, stopped at {meta.options?.maxFiles} files
        </div>
      )}

      {s && (
        <div className="hud-stats">
          <Stat k="files" v={meta?.fileCount ?? s.files} />
          <Stat k="dirs" v={meta?.dirCount ?? s.dirs} />
          <Stat k="die" v={`${layout.die.w}µm`} />
        </div>
      )}

      <div className="hud-acts">
        <button onClick={onTheme} title="cycle theme (t)">
          <span>theme</span><b>{theme.label}</b>
        </button>
        <button
          className={showChannels ? 'on' : ''}
          onClick={() => onChannels(!showChannels)}
          title="routing channels (c)"
        >
          <span>channels</span><b>{showChannels ? 'on' : 'off'}</b>
        </button>
        <button
          className={showTraces ? 'on' : ''}
          onClick={() => onTraces(!showTraces)}
          title="dependency traces on hover (r)"
        >
          <span>traces</span><b>{showTraces ? 'on' : 'off'}</b>
        </button>
        <button onClick={onFit} title="fit to view (f)">
          <span>fit</span><b>f</b>
        </button>
      </div>

      <button
        className={`hud-more${open ? ' on' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>more</span><b>{open ? '−' : '+'}</b>
      </button>

      {open && (
        <div className="hud-extra">
          <form
            className="hud-scan"
            onSubmit={(e) => { e.preventDefault(); if (path.trim()) onScan(path.trim()); }}
          >
            <input
              className="hud-input"
              placeholder="path to scan"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              spellCheck={false}
            />
            <button className="hud-go" type="submit" disabled={busy}>→</button>
          </form>

          <label className="hud-field">
            <span>weight</span>
            <select
              value={weightMode}
              onChange={(e) => onWeightMode(e.target.value)}
              title={WEIGHT_MODE_HELP[weightMode]}
            >
              {WEIGHT_MODE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>

          {s && (
            <div className="hud-stats">
              <Stat k="bytes" v={fmtBytes(meta?.totalBytes)} />
              <Stat k="fill" v={`${(s.fillRatio * 100).toFixed(0)}%`} />
              <Stat k="channels" v={layout.channels.length} />
              <Stat k="culled" v={s.culled} />
              {netlist && <Stat k="edges" v={netlist.live} />}
            </div>
          )}

          <div className="hud-legend">
            {MACRO_TYPES.map((t) => (
              <span key={t}>
                <i style={{ background: theme.types[t].fill, borderColor: theme.types[t].stroke }} />
                {TYPE_LABEL[t]}
              </span>
            ))}
          </div>

          <div className="hud-hint">drag · wheel · f fit · t theme · c channels · r traces · h hide</div>
        </div>
      )}
    </aside>
  );
}
