#!/usr/bin/env python3
"""
Build DIESHOT's block textures from a real die photograph.

The synthetic line patterns this replaces were the tell: real silicon is
photographic - irregular, noisy, fine-grained - and no amount of tidy geometry
reads that way. So each block type is filled with an actual crop of a
photographed die, chosen because that region genuinely is that kind of circuit.

Source: AMD Athlon (K7 "Pluto") die shot by Fritzchens Fritz, released under
CC0 1.0 Universal (public domain dedication) via Wikimedia Commons.

Textures are written GRAYSCALE. Colour is applied at render time by an SVG
feColorMatrix ramp per theme, so the palette stays data-driven and one set of
assets serves every theme.

    python tools/make-textures.py [--src path/to/die.jpg] [--size 512]
"""
from __future__ import annotations

import argparse
import pathlib
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageOps

SOURCE_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/c/c2/"
    "AMD_Athlon_K7_Pluto_K7700MTR51B_A_Stack-DSC04365-DSC04399_-_ZS-PMax_"
    "%2823503907133%29.jpg"
)
SOURCE_PAGE = (
    "https://commons.wikimedia.org/wiki/File:AMD_Athlon_K7_Pluto_K7700MTR51B_A_"
    "Stack-DSC04365-DSC04399_-_ZS-PMax_(23503907133).jpg"
)

# Crop origins in the 4543x3602 source, chosen by inspecting the die: each
# region is genuinely the kind of circuit it is being used to represent.
CROP = 560
REGIONS = {
    #  name            x     y    what it actually is on the die
    "memory":     ( 689, 2997),   # uniform cache array, fine regular bitlines
    "core":       (1991, 1521),   # standard-cell logic, fibrous vertical grain
    "parallel":   (2642, 2259),   # a regular grid of identical macro cells
    "peripheral": (2642, 1521),   # mottled irregular glue logic
    "io":         (3944, 2997),   # die-edge bus rails and power straps
    "test":       (2642,  782),   # sparse, near-featureless logic fill
}


def fetch(dst: pathlib.Path) -> pathlib.Path:
    if dst.exists():
        print(f"  using cached {dst}")
        return dst
    print(f"  downloading {SOURCE_URL}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "dieshot-textures/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r, open(dst, "wb") as f:
        f.write(r.read())
    return dst


def seamless(img: Image.Image, feather: int) -> Image.Image:
    """
    Make a tile wrap by cross-fading each edge into the strip that follows it.

    Mirror-tiling would be seamless too, but its symmetry is instantly readable
    as a repeat; a cross-fade keeps the grain irregular.
    """
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape
    ow, oh = w - feather, h - feather

    out = a[:oh, :ow].copy()

    ramp = np.linspace(0.0, 1.0, feather, dtype=np.float32)[None, :]
    out[:, :feather] = out[:, :feather] * ramp + a[:oh, ow:ow + feather] * (1 - ramp)

    ramp_v = np.linspace(0.0, 1.0, feather, dtype=np.float32)[:, None]
    out[:feather, :] = out[:feather, :] * ramp_v + a[oh:oh + feather, :ow] * (1 - ramp_v)

    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def normalise(img: Image.Image, mean: float = 128.0, std: float = 42.0) -> Image.Image:
    """
    Put every tile on the same exposure.

    The crops come from different parts of one photograph and differ in
    brightness by more than the block types differ from each other. Left alone,
    the texture would carry the palette instead of the type tag doing it.
    """
    a = np.asarray(img).astype(np.float32)
    cur_std = a.std()
    if cur_std < 1e-3:
        return img
    a = (a - a.mean()) / cur_std * std + mean
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def main() -> int:
    here = pathlib.Path(__file__).resolve().parent
    root = here.parent

    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=pathlib.Path, default=here / ".cache" / "die-source.jpg")
    ap.add_argument("--out", type=pathlib.Path, default=root / "public" / "textures")
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--quality", type=int, default=82)
    args = ap.parse_args()

    src = fetch(args.src)
    im = Image.open(src)
    print(f"  source {im.size[0]}x{im.size[1]}")

    args.out.mkdir(parents=True, exist_ok=True)
    total = 0

    for name, (x, y) in REGIONS.items():
        tile = im.crop((x, y, x + CROP, y + CROP)).convert("L")
        tile = ImageOps.autocontrast(tile, cutoff=1)
        tile = normalise(tile)
        tile = seamless(tile, feather=CROP // 8)
        tile = tile.resize((args.size, args.size), Image.LANCZOS)

        dst = args.out / f"{name}.jpg"
        tile.save(dst, "JPEG", quality=args.quality, optimize=True)
        kb = dst.stat().st_size / 1024
        total += kb
        print(f"  {name:<11} -> {dst.name:<16} {kb:6.1f} KB")

    (args.out / "CREDITS.md").write_text(
        "# Texture provenance\n\n"
        "The block textures in this directory are crops of a real die "
        "photograph, converted to grayscale and normalised.\n\n"
        "**Source:** AMD Athlon (K7 \"Pluto\") die shot by Fritzchens Fritz.\n\n"
        f"- Image: {SOURCE_PAGE}\n"
        f"- File: {SOURCE_URL}\n"
        "- Licence: **CC0 1.0 Universal** (public domain dedication) - no "
        "attribution required, retained here as a courtesy.\n\n"
        "Regenerate with `python tools/make-textures.py`.\n",
        encoding="utf-8",
    )

    print(f"  total {total:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
