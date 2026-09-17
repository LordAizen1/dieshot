# dieshot

Draws a folder like a chip die.

![a repo drawn as a die](dieshot-screenshot.jpg)

Code visualizers always give you that same blob of dots and lines. Folders
aren't blobs though, they're boxes inside boxes, same as chips. So I borrowed
the chip layout algorithm.

Hover anything and it wires up the imports, routed through the gaps between
blocks. A file shows its own; a folder shows everything under it:

![traces routed between blocks](dieshot-traces.jpg)

## Run it

```bash
npx dieshot
```

Draws whatever folder you're standing in and opens a tab. Give it a path for
somewhere else: `npx dieshot ./some/folder`. Nothing gets uploaded, it all
happens on your machine.

Drag to pan, scroll to zoom. `f` fit, `t` theme, `c` channels, `r` traces,
`h` hides the panel.

Finding the imports means opening every source file, which is the slow bit, so
on a big tree it reads a sample and tells you it did. Want the lot, open `more`
in the panel and flip imports to `all`, or pass `--all-imports`. Either way you
get a loading screen with a clock on it.

Stops at 50k files so you don't scan your whole drive by accident. Needs Node
20.19+. `npx dieshot --help` has the other flags.

If you'd rather have the source:

```bash
git clone https://github.com/LordAizen1/dieshot
cd dieshot && npm install && npm run dev
```

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
