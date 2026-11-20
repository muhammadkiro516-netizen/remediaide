"""Assemble Playwright frames (scripts/record-demo-gif.ts) into an optimised GIF.

  ml/.venv/bin/python scripts/frames_to_gif.py <frames-dir> docs/media/demo.gif [--width 960]
Each frame keeps its own duration (timing.json); adds short cross-fades between scenes; adaptive palette per frame.
"""

import argparse
import json
from pathlib import Path

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--width", type=int, default=960)
    a = ap.parse_args()
    timing = json.loads((a.frames / "timing.json").read_text())
    files = sorted(a.frames.glob("*.png"))
    assert len(files) == len(timing), (len(files), len(timing))
    imgs, durs = [], []
    prev = None
    for f, ms in zip(files, timing, strict=True):
        im = Image.open(f).convert("RGB")
        im = im.resize((a.width, round(im.height * a.width / im.width)), Image.LANCZOS)
        if prev is not None and ms >= 1000:  # scene change -> 2-step cross-fade
            for t in (0.33, 0.66):
                imgs.append(Image.blend(prev, im, t))
                durs.append(90)
        imgs.append(im)
        durs.append(ms)
        prev = im
    pal = [im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for im in imgs]
    a.out.parent.mkdir(parents=True, exist_ok=True)
    pal[0].save(a.out, save_all=True, append_images=pal[1:], duration=durs, loop=0, optimize=True, disposal=1)
    print(f"{a.out}: {len(pal)} frames, {sum(durs) / 1000:.1f} s, {a.out.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
