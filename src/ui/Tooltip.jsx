import { TYPE_LABEL } from '../../shared/types.js';

const fmtBytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)}${u[i]}`;
};

export default function Tooltip({ block: b, x, y, theme }) {
  const type = b.kind === 'macro' ? (theme.types[b.type] || theme.types.TYPE_CORE) : null;

  return (
    <div
      className="tooltip"
      style={{
        left: Math.min(x + 16, window.innerWidth - 300),
        top: Math.min(y + 16, window.innerHeight - 140),
        borderColor: type ? type.stroke : theme.ic.edge,
        background: theme.substrate,
        color: theme.text,
      }}
    >
      <div className="tt-name">{b.path || b.name}</div>
      <div className="tt-grid" style={{ color: theme.dim }}>
        <span>tag</span><b>{TYPE_LABEL[b.type] || b.type}</b>
        <span>kind</span><b>{b.kind === 'macro' ? `macro · ${b.childCount} children` : `ic · ${b.package}`}</b>
        <span>size</span><b>{b.synthetic ? `${b.count} files · ${fmtBytes(b.bytes)}` : fmtBytes(b.bytes)}</b>
        <span>rect</span><b>{b.w}×{b.h} @ {b.x},{b.y}</b>
        <span>depth</span><b>{b.depth}{b.ports ? ` · ${b.ports.length} pins` : ''}</b>
      </div>
    </div>
  );
}
