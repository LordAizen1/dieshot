# dieshot

Draws a folder like a chip die.

![a repo drawn as a die](dieshot-screenshot.jpg)

Code visualizers always give you that same blob of dots and lines. Folders
aren't blobs though, they're boxes inside boxes, same as chips. So I borrowed
the chip layout algorithm.

Hover a file and it wires up its imports through the gaps between blocks:

![traces routed between blocks](dieshot-traces.jpg)

## Run it

```bash
npm install
npm run scan -- /path/to/some/repo
npm run dev
```

Needs Node 20.19+ or 22.12+ (that's Vite's requirement, not mine).

Drag to pan, scroll to zoom. `f` fit, `t` theme, `c` channels, `r` traces,
`h` hides the panel. There's a box in the panel to rescan a different path.

Huge folders are slow in dev mode because React renders everything twice. Use
`npm run build && npm run preview` for those.

## How it works

Take a rectangle, cut it in two, keep cutting. That's a slicing floorplan. Make
each cut slightly wider than a line and you get gaps, and all the gaps join up,
so there's always a clear path between any two blocks. Then the imports get
routed through those gaps with A\* plus a turn penalty, so wires come out as
long straight runs instead of staircases.

Folder names pick the cut direction. `models` and `db` cut vertically so they
look like memory banks, `components` alternates into a grid, `utils` gets long
thin strips. One table in `shared/types.js` if you want to change that.

It only draws what's big enough to see. Blocks open up as you zoom in, and a
closed block still shows its real contents as little cells, so a folder with
twelve icons looks like a grid of twelve things.

`npm run check` makes sure nothing overlaps, nothing sits in a gap, and no wire
cuts through a block.

## Borrowed from

The layout is a slicing floorplan and the wiring is basically a maze router,
both old VLSI ideas. It's also, if I'm honest, a treemap with gaps in it. I
picked all this up secondhand rather than from the papers, so if you want the
real thing, the terms to search are "slicing floorplan", "channel routing" and
"squarified treemap".

Textures are crops of a die photo by Fritzchens Fritz, released CC0. See
`public/textures/CREDITS.md`. Lettering is DIN 1451.

MIT.
