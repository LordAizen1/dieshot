/**
 * Floorplan constants.
 *
 * Every length here is a multiple of GRID. That is deliberate: if the cut
 * coordinate, the channel width, the seal ring and the label bar are all
 * on-lattice, then every rectangle the engine emits is on-lattice too, and the
 * orthogonal router gets to work on a clean integer grid.
 */

export const GRID = 4;

/**
 * Channel width by NESTING depth (clamped to the last entry).
 *
 * Wide trunks at the top of the hierarchy, narrow local channels deeper in -
 * the same reason a real metal stack has fat M6 straps and thin M1 routing.
 * Keying off nesting depth rather than cut depth means every corridor inside
 * one directory is identical, which is what reads as "manufactured".
 */
export const CHANNEL = [28, 20, 12, 8, 4];

/** Macro-block border inset (seal ring). SEAL[0] doubles as the die pad ring. */
export const SEAL = [32, 12, 8, 4, 4];

/**
 * Band reserved inside each macro for its name. Wide blocks take it off the
 * top and read horizontally; distinctly tall blocks take it off the LEFT and
 * read bottom-to-top, which is how real floorplans label narrow partitions.
 */
export const LABEL_H = [24, 16, 12, 8, 0];

/** Cut over to a left-hand vertical band below this width:height ratio. */
export const LABEL_VERTICAL_RATIO = 0.7;

export const MIN_SIDE = 8;        // multiple of GRID, so clamping stays on-lattice
export const MIN_AREA = 96;       // below this a child folds into a "+N more" block
export const MIN_ASPECT = 1 / 6;  // no spaghetti slivers

export const PIN_PITCH = 8;       // 2 * GRID, so pin coordinates land on-lattice
export const PIN_LENGTH = 3;      // stub length, must stay under the narrowest channel

export const CELL_PITCH = 72;     // average world px budgeted per file
export const MIN_DIE = 640;
export const MAX_DIE = 9000;

export const PAD_RING = SEAL[0];

/**
 * Pitch of the top-metal power grid. Real dies carry a regular mesh of wide
 * VDD/VSS straps over every block; it is the most recognisable feature of a
 * die photograph, so it is drawn as one patterned overlay across the core.
 */
export const POWER_PITCH = 96;

/* --------------------------------------------------------- semantic zoom */

/**
 * How large a typical block at a given depth must appear on screen before its
 * children are resolved at all. Below this the block stays a solid, annotated
 * macro - which is exactly what a floorplan looks like at low magnification.
 */
export const OPEN_PX = 250;

/** Zoom factor over which a newly resolved level fades in. */
export const REVEAL_BAND = 1.9;

/** Screen-space blur, in px, applied to a level that is still resolving. */
export const MAX_BLUR = 6;

/** Extra area budget per directory, in file-cells: pays for seal rings and
 * label bars so deep trees stop starving their own leaves. */
export const DIR_AREA = 4;
