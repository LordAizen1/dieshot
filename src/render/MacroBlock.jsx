import { TYPE_LABEL, TYPE_MEMORY, TYPE_IO } from '../../shared/types.js';
import { textWidth, truncate, fitLabel } from './text.js';
import { variantOf } from './color.js';

/**
 * A directory: one macro block (SoC partition). Depth 0 is skipped - the Die
 * component owns the root's ring.
 *
 * A block is CLOSED when its children are not being drawn. A closed block is
 * not an empty frame: it is a solid, textured, annotated macro, which is what
 * a floorplan actually looks like at low magnification. Only once it opens
 * does it become a container and hand its identity to the label band.
 *
 * Structural detail lives in the SEAL BAND, the reserved border between the
 * block edge and its interior. That is the only space the layout leaves free,
 * and it is also where a real block puts its guard ring - so the detail is
 * both authentic and guaranteed not to collide with children.
 */
export default function MacroBlock({ b, theme, scale, closed }) {
  const t = theme.types[b.type] || theme.types.TYPE_CORE;
  const wPx = b.w * scale;
  const hPx = b.h * scale;
  const apparent = Math.sqrt(b.w * b.h) * scale;

  const sideways = b.labelSide === 'left';
  const band = b.band || 0;
  const bandPx = band * scale;
  const runPx = sideways ? hPx : wPx;

  const tag = TYPE_LABEL[b.type] || '';

  // Annotated die-shot label: a closed macro carries its name across the block
  // itself, the way a published die shot annotates its major partitions.
  // Screen-constant size, not world-proportional. An annotated die shot labels
  // every partition at one readable size whatever the magnification; sizing the
  // text in world units makes it 6px on a large die and absurd on a small one.
  // fitLabel still shrinks it to fit blocks that cannot hold it.
  const annotation = closed && apparent > 84
    ? fitLabel(b.name, b.w * 0.88, b.h * 0.88, { maxFont: 17 / scale, pad: 8, min: 3 })
    : null;

  const showBandText = band > 0 && bandPx > 6.5 && runPx > 40 && !annotation;
  const fontSize = Math.max(6, Math.min(band * 0.62, 14));
  const showTag = band > 0 && bandPx > 6.5 && runPx > 130;
  const tagW = textWidth(tag, fontSize * 0.82);

  const run = (sideways ? b.h : b.w) - 12;
  const nameSpace = run - (showTag ? tagW + 10 : 0);
  const name = showBandText ? truncate(b.name, nameSpace, fontSize) : '';

  const bandRect = sideways
    ? { x: b.x, y: b.y, width: band, height: b.h }
    : { x: b.x, y: b.y, width: b.w, height: band };

  // Vertical labels read bottom-to-top, the convention on real floorplans.
  const nameX = sideways ? b.x + band * 0.74 : b.x + 6;
  const nameY = sideways ? b.y + b.h - 6 : b.y + band * 0.74;
  const tagX = sideways ? b.x + band * 0.74 : b.x + b.w - 6;
  const tagY = sideways ? b.y + 6 : b.y + band * 0.74;
  const rot = (x, y) => (sideways ? `rotate(-90 ${x} ${y})` : undefined);

  // Edge circuitry, LOD-gated so it never appears as noise.
  const detail = Math.min(wPx, hPx) > 54 && b.seal >= 8;
  const guard = detail && (b.type === TYPE_MEMORY || b.type === TYPE_IO);
  const senseH = Math.min(b.seal - 3, 5);
  const senseAmps = detail && b.type === TYPE_MEMORY && senseH >= 2.5;
  const bevel = closed && apparent > 60 && !!theme.packaged;

  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  return (
    <g data-id={b.id}>
      {/*
        See ICBlock: a physical edge scales, a drawn one does not - but a purely
        world-space edge is 28px thick at 15x, so it is capped in SCREEN terms.
        It grows with magnification the way a real seal does, then stops.
      */}
      <rect
        x={b.x} y={b.y} width={b.w} height={b.h}
        fill={`url(#pat-${b.type}-${variantOf(b.path)})`}
        stroke={t.edge}
        strokeWidth={theme.packaged ? 1 : Math.min(1.8, 5 / scale)}
        strokeOpacity={0.85}
        vectorEffect={theme.packaged ? 'non-scaling-stroke' : undefined}
      />

      {/* A solid macro catches light along its top and left sidewalls. */}
      {bevel && (
        <g stroke={t.stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.28">
          <line x1={b.x + 1} y1={b.y + 1} x2={b.x + b.w - 1} y2={b.y + 1} />
          <line x1={b.x + 1} y1={b.y + 1} x2={b.x + 1} y2={b.y + b.h - 1} />
        </g>
      )}

      {/* Guard ring: the substrate-tap ring that encloses memory and I/O. */}
      {guard && (
        <rect
          x={b.x + 2.5} y={b.y + 2.5} width={b.w - 5} height={b.h - 5}
          fill="none" stroke={theme.guard} strokeWidth={Math.min(0.8, 2.5 / scale)} opacity="0.4"
        />
      )}

      {/* Sense amps / column decode: the bright strip along a bank's edge. */}
      {senseAmps && (
        <rect
          x={b.x + b.seal * 0.5} y={b.y + b.h - b.seal * 0.5 - senseH}
          width={b.w - b.seal} height={senseH}
          fill={theme.sense} opacity="0.3"
        />
      )}

      {band > 0 && (
        <rect {...bandRect} fill={t.stroke}
              opacity={theme.packaged ? (closed ? 0.22 : 0.16) : (closed ? 0.1 : 0.07)} />
      )}

      {name && (
        <text
          x={nameX} y={nameY} transform={rot(nameX, nameY)}
          fontSize={fontSize} fill={t.ink} fontFamily="var(--tech)" fontWeight="500"
          stroke={theme.textHalo} strokeWidth={fontSize * 0.2}
          strokeLinejoin="round" paintOrder="stroke"
        >
          {name}
        </text>
      )}

      {showTag && (
        <text
          x={tagX} y={tagY} transform={rot(tagX, tagY)}
          fontSize={fontSize * 0.82} fill={t.stroke} opacity="0.8"
          textAnchor="end"
          fontFamily="var(--tech)" letterSpacing="0.8"
          stroke={theme.textHalo} strokeWidth={fontSize * 0.16}
          strokeLinejoin="round" paintOrder="stroke"
        >
          {tag}
        </text>
      )}

      {annotation && (
        <g
          transform={annotation.vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
          fontFamily="var(--tech)" fontWeight="600" textAnchor="middle"
        >
          <text
            x={cx} y={cy + annotation.fontSize * 0.34}
            fontSize={annotation.fontSize} fill={t.ink}
            letterSpacing={annotation.fontSize * 0.06}
            stroke={theme.textHalo} strokeWidth={annotation.fontSize * 0.16}
            strokeLinejoin="round" paintOrder="stroke"
          >
            {annotation.text}
          </text>
          {apparent > 150 && (
            <text
              x={cx} y={cy + annotation.fontSize * 1.5}
              fontSize={annotation.fontSize * 0.5} fill={t.stroke}
              letterSpacing={annotation.fontSize * 0.14} opacity="0.75"
              stroke={theme.textHalo} strokeWidth={annotation.fontSize * 0.1}
              strokeLinejoin="round" paintOrder="stroke"
            >
              {`${tag} · ${b.childCount}`}
            </text>
          )}
        </g>
      )}
    </g>
  );
}
