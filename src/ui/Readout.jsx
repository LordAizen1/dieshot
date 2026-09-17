/**
 * Corner readout: scale bar, magnification, and what is actually on screen.
 *
 * Every published micrograph carries a scale bar, and it is the one annotation
 * that makes a die photo legible - it tells you the real size of what you are
 * looking at rather than how many times the pixels were multiplied.
 *
 * Magnification is expressed against "the whole die fits the viewport" = 1x.
 * Raw scale would be meaningless across repos, because a 640µm die and a
 * 9,000µm die start at wildly different numbers; relative to fit, every die
 * starts at 1x and the ceiling honestly reflects how much structure there is
 * to magnify into.
 */

/** Nearest 1-2-5 value, so the bar is always a round number of microns. */
function niceLength(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const mant = raw / pow;
  const step = mant < 1.5 ? 1 : mant < 3.5 ? 2 : mant < 7.5 ? 5 : 10;
  return step * pow;
}

const fmtLength = (um) => (um >= 1000
  ? `${+(um / 1000).toFixed(um % 1000 ? 1 : 0)} mm`
  : `${+um.toFixed(um < 1 ? 2 : 0)} µm`);

const fmtMag = (m) => {
  if (m >= 1000) return `${Math.round(m / 100) / 10}k`;
  if (m >= 10) return String(Math.round(m));
  if (m >= 1) return m.toFixed(1);
  return m.toFixed(2);
};

export default function Readout({ scale, fitScale, theme, drawn, cells, total, deepest }) {
  // Aim for a ~96px bar, then round the micron count to something speakable.
  const um = niceLength(96 / scale);
  const px = um * scale;
  const mag = scale / (fitScale || 1);

  return (
    <div className="readout" style={{ '--ink': theme.text, '--dim': theme.dim }}>
      <div className="readout-scale">
        <span>{fmtLength(um)}</span>
        <i style={{ width: `${px}px` }} />
      </div>
      <div className="readout-mag">{fmtMag(mag)}&times;</div>
      <div className="readout-meta">
        {drawn} / {total} blocks · {cells} cells · depth ≤ {deepest}
      </div>
    </div>
  );
}
