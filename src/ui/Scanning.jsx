import { useEffect, useState } from 'react';

/**
 * The wait.
 *
 * A scan used to be a word in the corner of the panel, which is fine for the
 * 40ms case and useless for the one that matters: reading every source file in
 * a big tree, where nothing moves for half a minute and the tab looks hung.
 *
 * So it gets a beam sweeping a reticle and a running clock. The clock is the
 * part that actually helps - it is the difference between "this is slow" and
 * "this is broken".
 */
export default function Scanning({ theme, label, detail }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="scanning" role="status" aria-live="polite">
      <div className="scan-veil" style={{ background: theme.page }} />

      <div className="scan-body" style={{ color: theme.text }}>
        <div className="scan-stage" style={{ borderColor: theme.accent }}>
          <div className="scan-grid" />
          <div className="scan-beam" style={{ background: theme.accent }} />
        </div>

        <div className="scan-label">{label}</div>
        {detail && <div className="scan-detail" style={{ color: theme.dim }}>{detail}</div>}
        <div className="scan-time" style={{ color: theme.dim }}>
          {secs < 1 ? '' : `${secs}s`}
        </div>
      </div>
    </div>
  );
}
