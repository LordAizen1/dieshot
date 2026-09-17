import { useState } from 'react';

/**
 * First thing a new user sees.
 *
 * The panel has a path box too, but it lives behind "more", which is no use to
 * someone who has just opened this and has nothing on screen. If there is no
 * die, the one thing you need is right here.
 */
export default function Empty({ theme, busy, onScan }) {
  const [path, setPath] = useState('');

  if (busy) {
    return (
      <div className="empty" style={{ color: theme.dim, background: theme.page }}>
        <div className="empty-title">scanning…</div>
      </div>
    );
  }

  return (
    <div className="empty" style={{ color: theme.dim, background: theme.page }}>
      <div className="empty-title">nothing loaded yet</div>

      <form
        className="empty-form"
        onSubmit={(e) => { e.preventDefault(); if (path.trim()) onScan(path.trim()); }}
      >
        <input
          className="empty-input"
          placeholder="paste a folder path and hit enter"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          spellCheck={false}
          autoFocus
        />
        <button className="empty-go" type="submit">scan</button>
      </form>

      <div className="empty-hint">
        or run <code>npm run scan -- {'<folder>'}</code> in a terminal
      </div>
    </div>
  );
}
