import { PAD_RING } from '../layout/constants.js';

/**
 * Die chrome: substrate, seal ring, bond-pad frame, alignment structures and
 * the corner markings. This occupies the root block's seal band (PAD_RING
 * wide), so MacroBlock skips depth 0 and lets this draw it.
 *
 * The details here are the ones a die photograph always has and a diagram
 * never does: a double seal ring at the scribe edge, bond pads with a
 * passivation opening inside the metal, vernier alignment ladders at the
 * corners, and process markings written in metal.
 */
export default function Die({ die, theme, meta, stats, scale, root, view }) {
  /*
   * A bond pad is SQUARE, and it is the same square on all four edges of the
   * die - the row runs along the edge, the pad itself does not lie down with
   * it. These used to be 13x6 pills that flipped their long axis per side,
   * which is lead-frame geometry, not a pad ring.
   */
  const pitch = 24;
  const inset = 9;
  const PAD = 12;
  const LIP = 1.8;   // passivation overlapping the metal on each side

  const run = (length) => {
    const n = Math.max(0, Math.floor((length - pitch * 2) / pitch));
    const start = (length - (n - 1) * pitch) / 2;
    return Array.from({ length: n }, (_, i) => start + i * pitch);
  };

  /*
   * Pad count scales with the die, so a large repo grows a ring of well over a
   * thousand pads - and once you have zoomed in, nearly all of them are off
   * screen. Left unculled that ring alone was ~4,000 DOM nodes at every zoom,
   * dwarfing the blocks actually being looked at and setting a floor no amount
   * of block culling could get under.
   */
  const near = (p) => !view
    || (p.x <= view.x + view.w && p.y <= view.y + view.h
        && p.x + p.w >= view.x && p.y + p.h >= view.y);

  const pads = [];
  if (scale > 0.18) {
    const sq = (x, y) => ({ x, y, w: PAD, h: PAD });
    for (const x of run(die.w)) {
      const a = sq(x - PAD / 2, inset);
      const b = sq(x - PAD / 2, die.h - inset - PAD);
      if (near(a)) pads.push(a);
      if (near(b)) pads.push(b);
    }
    for (const y of run(die.h)) {
      const a = sq(inset, y - PAD / 2);
      const b = sq(die.w - inset - PAD, y - PAD / 2);
      if (near(a)) pads.push(a);
      if (near(b)) pads.push(b);
    }
  }

  const showOpenings = scale > 0.55;
  const showProbe = scale > 1.1;

  /*
   * The scrub a test probe leaves in the aluminium. Every packaged die has
   * been probed, so every pad carries one, and it is the detail that stops a
   * pad ring looking like a row of drawn rectangles. Offset is derived from
   * the index so it is different per pad but identical between frames.
   */
  const probe = (p, i) => {
    const open = PAD - LIP * 2;
    const w = open * 0.44;
    const h = open * 0.15;
    const jx = (((i * 7) % 5) - 2) * (open * 0.07);
    const jy = (((i * 11) % 5) - 2) * (open * 0.07);
    return {
      x: p.x + LIP + (open - w) / 2 + jx,
      y: p.y + LIP + (open - h) / 2 + jy,
      w, h,
    };
  };

  // Vernier alignment ladders: unequal pitch on the two scales is what makes a
  // vernier readable, and it is unmistakably a lithography structure.
  const vernier = (ox, oy, flipX, flipY) => {
    const bars = [];
    for (let i = 0; i < 5; i++) {
      bars.push(
        <rect key={`a${i}`} x={ox + flipX * (2 + i * 4)} y={oy} width="1.4" height="7" />,
        <rect key={`b${i}`} x={ox + flipX * (2 + i * 4.6)} y={oy + flipY * 10} width="1.4" height="5" />,
      );
    }
    return bars;
  };

  // Follow the root block's actual label placement instead of assuming a
  // top band - a tall die puts it on the left edge.
  const band = root ? (root.band || 0) : 0;
  const bandTop = !!root && root.labelH > 0;
  const bandLeft = !!root && root.labelW > 0;

  const c = PAD_RING * 0.5;
  const fid = 8;
  const corners = [
    [c, c], [die.w - c, c], [c, die.h - c], [die.w - c, die.h - c],
  ];

  return (
    <g>
      <rect x={0} y={0} width={die.w} height={die.h} fill={theme.dieFill} />

      {/* Scribe-edge seal: two concentric metal rings at the die boundary. */}
      <rect x={3} y={3} width={die.w - 6} height={die.h - 6}
            fill="none" stroke={theme.seal} strokeWidth="1.6"
            vectorEffect="non-scaling-stroke" opacity="0.9" />
      <rect x={6.5} y={6.5} width={die.w - 13} height={die.h - 13}
            fill="none" stroke={theme.seal} strokeWidth="0.8"
            vectorEffect="non-scaling-stroke" opacity="0.5" />
      <rect x={PAD_RING - 4} y={PAD_RING - 4}
            width={die.w - (PAD_RING - 4) * 2} height={die.h - (PAD_RING - 4) * 2}
            fill="none" stroke={theme.seal} strokeWidth="1"
            vectorEffect="non-scaling-stroke" opacity="0.45" />

      {/*
        Bond pads. The bright part is the OPENING - the window etched through
        the passivation down to bare aluminium - and the dull border is the
        metal still covered by it. This was inside out before: a bright pad
        with a dark square dropped in the middle, which reads as an empty box
        rather than as exposed metal.
      */}
      <g>
        {pads.map((p, i) => (
          <g key={i}>
            {showOpenings ? (
              <>
                <rect x={p.x} y={p.y} width={PAD} height={PAD}
                      fill={theme.padOpening} opacity="0.9" />
                <rect x={p.x + LIP} y={p.y + LIP}
                      width={PAD - LIP * 2} height={PAD - LIP * 2}
                      fill={theme.pad} opacity="0.92" />
                {showProbe && (() => {
                  const m = probe(p, i);
                  return <rect x={m.x} y={m.y} width={m.w} height={m.h}
                               fill={theme.padOpening} opacity="0.38" />;
                })()}
              </>
            ) : (
              // Too small to resolve an opening; one solid square of metal.
              <rect x={p.x} y={p.y} width={PAD} height={PAD}
                    fill={theme.pad} opacity="0.8" />
            )}
          </g>
        ))}
      </g>

      {scale > 0.25 && (
        <g stroke={theme.fiducial} strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7">
          {corners.map(([cx, cy], i) => (
            <g key={i}>
              <line x1={cx - fid} y1={cy} x2={cx + fid} y2={cy} />
              <line x1={cx} y1={cy - fid} x2={cx} y2={cy + fid} />
              <rect x={cx - fid * 0.5} y={cy - fid * 0.5} width={fid} height={fid} fill="none" opacity="0.6" />
            </g>
          ))}
        </g>
      )}

      {/*
        Verniers live in the root's label band, the one strip inside the core
        that the layout guarantees is empty. Anywhere else would draw over a
        child block.
      */}
      {scale > 0.7 && bandTop && die.w > 420 && (
        <g fill={theme.fiducial} opacity="0.5">
          {vernier(die.w - PAD_RING - 64, PAD_RING + 4, 1, 1)}
        </g>
      )}

      {/* Process markings, written in metal like the real thing. */}
      {scale > 0.2 && (
        <>
          <text x={PAD_RING + 2} y={die.h - PAD_RING + 13}
                fill={theme.dim} fontSize="11" fontFamily="var(--tech)" letterSpacing="1.4">
            {`DIESHOT · ${meta?.name ?? 'DIE'} · ${meta?.fileCount ?? stats.files}F ` +
             `${meta?.dirCount ?? stats.dirs}D · ${die.w}×${die.h}µm`}
          </text>
          {/*
            The root's own label band is the only free strip inside the core.
            It sits on top for a wide die and on the left for a tall one, so the
            marking follows it rather than assuming.
          */}
          {bandTop && (
            <text x={PAD_RING + 2} y={PAD_RING + band * 0.66}
                  fill={theme.dim} fontSize={Math.min(10, band * 0.52)}
                  fontFamily="var(--tech)" letterSpacing="2" opacity="0.8">
              {`SLICING FLOORPLAN · REV 0.1 · M${stats.maxDepth}`}
            </text>
          )}
          {bandLeft && (
            <text
              x={PAD_RING + band * 0.66} y={die.h - PAD_RING - 4}
              transform={`rotate(-90 ${PAD_RING + band * 0.66} ${die.h - PAD_RING - 4})`}
              fill={theme.dim} fontSize={Math.min(10, band * 0.52)}
              fontFamily="var(--tech)" letterSpacing="2" opacity="0.8"
            >
              {`SLICING FLOORPLAN · REV 0.1 · M${stats.maxDepth}`}
            </text>
          )}
          {die.h > 480 && (
            <text
              x={die.w - PAD_RING + 7} y={PAD_RING + 6}
              transform={`rotate(90 ${die.w - PAD_RING + 7} ${PAD_RING + 6})`}
              fill={theme.dim} fontSize="8" fontFamily="var(--tech)"
              letterSpacing="2" opacity="0.55"
            >
              {`${stats.files} CELLS · FILL ${(stats.fillRatio * 100).toFixed(0)}%`}
            </text>
          )}
        </>
      )}
    </g>
  );
}
