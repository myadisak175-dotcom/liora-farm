#!/usr/bin/env python3
"""Turn a magenta-keyed painting into a horizon band the game can wrap.

The three backdrop strips were each prepared by hand, which is fine once and a
liability the second time: the meadow band arrived claiming to be seamless,
and it was — at its outer wrap. It had a hard join at the exact middle instead,
32x the image's own column-to-column difference, invisible until you tile it.
Nobody was going to catch that by eye, so the check lives here now.

    python3 tools/prep_backdrop.py in.png out.webp [--overlap 192]

What it does, in order:

  key        magenta -> alpha, un-premultiplied so the edge keeps its colour
             instead of darkening toward black
  despill    strips the magenta that bled into the artwork's own edge pixels,
             which otherwise shows as a violet rim against the sky
  crop       drops fully transparent rows; a strip that is two thirds empty
             sky costs two thirds of its resolution for nothing
  heal       finds the worst vertical discontinuity and, if it is far enough
             from the ends to be a real seam rather than the wrap, blends it
             out by overlapping the two sides
  verify     re-measures every column and refuses to write a file whose worst
             seam is still an outlier

Run it again on the same input and you get the same output: no randomness, no
manual steps.
"""
import argparse
import sys

from PIL import Image

KEY = (255, 0, 255)


def key_magenta(image, tolerance=90):
    """Magenta to alpha, un-premultiplied.

    A pixel that is 60% magenta is not "dark green" — it is green seen through
    60% transparency. Dividing the remaining colour back out is what keeps the
    horizon edge the colour the painter made it.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    px = rgba.load()
    for y in range(height):
        for x in range(width):
            r, g, b, _ = px[x, y]
            # How much of this pixel is the key: magenta is red+blue with no
            # green, so the green channel measures how much artwork survives.
            magenta = min(r, b)
            spill = magenta - g
            if spill <= 0:
                px[x, y] = (r, g, b, 255)
                continue
            if spill >= tolerance:
                px[x, y] = (0, 0, 0, 0)
                continue
            alpha = 1.0 - spill / tolerance
            # Un-premultiply, then pull red and blue down to the green level so
            # no violet rim survives along the skyline.
            out = []
            for channel in (r, g, b):
                value = (channel - KEY[len(out)] * (1 - alpha)) / alpha if alpha > 0 else 0
                out.append(max(0, min(255, round(value))))
            out[0] = min(out[0], out[1] + 12)
            out[2] = min(out[2], out[1] + 12)
            px[x, y] = (out[0], out[1], out[2], round(alpha * 255))
    return rgba


def crop_transparent_rows(image):
    box = image.getbbox()
    if box is None:
        return image
    return image.crop((0, box[1], image.size[0], box[3]))


def column_gaps(image):
    """Mean per-pixel difference between each column and the next, wrapping.

    Premultiplied, so a transparent row cannot pretend two columns agree.
    """
    width, height = image.size
    px = image.load()
    gaps = []
    for x in range(width):
        nxt = (x + 1) % width
        total = 0
        for y in range(height):
            ar, ag, ab, aa = px[x, y]
            br, bg, bb, ba = px[nxt, y]
            sa, sb = aa / 255, ba / 255
            total += (abs(ar * sa - br * sb) + abs(ag * sa - bg * sb)
                      + abs(ab * sa - bb * sb) + abs(aa - ba))
        gaps.append(total / (height * 4))
    return gaps


def heal_seam(image, overlap):
    """Blend out the worst interior discontinuity by overlapping its two sides.

    Overlapping rather than cross-dissolving in place: the two sides are
    different paintings, not two takes of the same one, so there is nothing to
    line up. Sliding the right side under the left and fading between them
    costs `overlap` pixels of width and reads, on rolling ground with no
    landmarks, as one more hill.
    """
    width, height = image.size
    gaps = column_gaps(image)
    mean = sum(gaps) / len(gaps)
    seam = max(range(width), key=lambda x: gaps[x])
    # The wrap is allowed to be the worst column — that join is made by tiling,
    # not by this function.
    if min(seam, width - 1 - seam) < overlap * 2:
        return image, None
    if gaps[seam] < mean * 4:
        return image, None

    left = image.crop((0, 0, seam + 1, height))
    right = image.crop((seam + 1, 0, width, height))
    if left.size[0] <= overlap or right.size[0] <= overlap:
        return image, None

    blended = Image.new("RGBA", (width - overlap, height))
    blended.paste(left.crop((0, 0, left.size[0] - overlap, height)), (0, 0))
    blended.paste(right.crop((overlap, 0, right.size[0], height)),
                  (left.size[0], 0))

    tail = left.crop((left.size[0] - overlap, 0, left.size[0], height)).load()
    head = right.crop((0, 0, overlap, height)).load()
    patch = Image.new("RGBA", (overlap, height))
    out = patch.load()
    for x in range(overlap):
        t = x / max(1, overlap - 1)
        t = t * t * (3 - 2 * t)  # smoothstep: no crease where the ramp starts
        for y in range(height):
            a, b = tail[x, y], head[x, y]
            out[x, y] = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(4))
    blended.paste(patch, (left.size[0] - overlap, 0))
    return blended, {"seam": seam, "gap": gaps[seam], "mean": mean, "overlap": overlap}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("destination")
    parser.add_argument("--overlap", type=int, default=192)
    # A band contributes a silhouette or it contributes a stripe. Art that is
    # mostly flat ground — a meadow, a lake — has its shape in the top handful
    # of rows and nothing below, and keeping the rest just paints a coloured
    # bar across the horizon. This crops to the part that has an edge in it.
    parser.add_argument("--keep-top", type=int, default=0,
                        help="keep only the top N rows of artwork")
    parser.add_argument("--tolerance", type=int, default=90)
    parser.add_argument("--quality", type=int, default=88)
    args = parser.parse_args()

    image = Image.open(args.source)
    print(f"in   {args.source}  {image.size[0]}x{image.size[1]}  {image.mode}")

    keyed = key_magenta(image, args.tolerance)
    cropped = crop_transparent_rows(keyed)
    print(f"key  cropped to {cropped.size[0]}x{cropped.size[1]} "
          f"({image.size[1] - cropped.size[1]} empty rows dropped)")

    if args.keep_top:
        cropped = cropped.crop((0, 0, cropped.size[0], min(args.keep_top, cropped.size[1])))
        print(f"crop kept the top {cropped.size[1]} rows — the part with a skyline in it")

    healed, seam = heal_seam(cropped, args.overlap)
    if seam:
        print(f"heal seam at x={seam['seam']} was {seam['gap']:.2f} "
              f"({seam['gap'] / seam['mean']:.0f}x the mean of {seam['mean']:.2f}); "
              f"blended over {seam['overlap']} px")
    else:
        print("heal no interior seam worth blending")

    gaps = column_gaps(healed)
    mean = sum(gaps) / len(gaps)
    worst = max(range(len(gaps)), key=lambda x: gaps[x])
    ratio = gaps[worst] / mean if mean else 0
    print(f"check worst column now x={worst} at {ratio:.1f}x the mean")
    if ratio > 4:
        print("REFUSED: a seam that visible would show the moment it wraps.", file=sys.stderr)
        return 1

    healed.save(args.destination, "WEBP", quality=args.quality, method=6)
    size = len(open(args.destination, "rb").read())
    print(f"out  {args.destination}  {healed.size[0]}x{healed.size[1]}  {size // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
