#!/usr/bin/env python3
"""Prepare magenta-keyed horizon art for Liora Farm.

Pipeline:
  magenta key -> despill -> crop transparent rows -> optional skyline crop
  -> heal strong interior seams -> verify every vertical join -> WebP

The command is deterministic and exits non-zero if a remaining seam is more
than four times the image's normal column-to-column variation.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

KEY = (255, 0, 255)


def key_magenta(image: Image.Image, tolerance: int = 90) -> Image.Image:
    rgba = image.convert("RGBA")
    px = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, _ = px[x, y]
            spill = min(r, b) - g
            if spill <= 0:
                px[x, y] = (r, g, b, 255)
                continue
            if spill >= tolerance:
                px[x, y] = (0, 0, 0, 0)
                continue
            alpha = 1.0 - spill / tolerance
            out = []
            for i, channel in enumerate((r, g, b)):
                value = (channel - KEY[i] * (1 - alpha)) / alpha if alpha > 0 else 0
                out.append(max(0, min(255, round(value))))
            # Remove the violet fringe left by the generated magenta key.
            out[0] = min(out[0], out[1] + 12)
            out[2] = min(out[2], out[1] + 12)
            px[x, y] = (*out, round(alpha * 255))
    return rgba


def crop_transparent_rows(image: Image.Image) -> Image.Image:
    box = image.getbbox()
    if box is None:
        raise ValueError("image became fully transparent after keying")
    return image.crop((0, box[1], image.size[0], box[3]))


def column_gaps(image: Image.Image) -> list[float]:
    """Mean premultiplied RGBA difference for each vertical join, including wrap."""
    width, height = image.size
    px = image.load()
    gaps: list[float] = []
    for x in range(width):
        nxt = (x + 1) % width
        total = 0.0
        for y in range(height):
            ar, ag, ab, aa = px[x, y]
            br, bg, bb, ba = px[nxt, y]
            sa, sb = aa / 255.0, ba / 255.0
            total += (
                abs(ar * sa - br * sb)
                + abs(ag * sa - bg * sb)
                + abs(ab * sa - bb * sb)
                + abs(aa - ba)
            )
        gaps.append(total / (height * 4))
    return gaps


def heal_one_seam(image: Image.Image, overlap: int, threshold: float = 4.0) -> tuple[Image.Image, dict | None]:
    width, height = image.size
    gaps = column_gaps(image)
    mean = sum(gaps) / len(gaps)
    seam = max(range(width), key=gaps.__getitem__)

    # The outer wrap is not an interior cut. If it is the outlier, refuse later
    # in verify() rather than smearing the two ends independently.
    if min(seam, width - 1 - seam) < overlap * 2 or gaps[seam] < mean * threshold:
        return image, None

    left = image.crop((0, 0, seam + 1, height))
    right = image.crop((seam + 1, 0, width, height))
    if left.width <= overlap or right.width <= overlap:
        return image, None

    blended = Image.new("RGBA", (width - overlap, height))
    blended.paste(left.crop((0, 0, left.width - overlap, height)), (0, 0))
    blended.paste(right.crop((overlap, 0, right.width, height)), (left.width, 0))

    tail = left.crop((left.width - overlap, 0, left.width, height)).load()
    head = right.crop((0, 0, overlap, height)).load()
    patch = Image.new("RGBA", (overlap, height))
    out = patch.load()
    for x in range(overlap):
        t = x / max(1, overlap - 1)
        t = t * t * (3 - 2 * t)
        for y in range(height):
            a, b = tail[x, y], head[x, y]
            out[x, y] = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(4))
    blended.paste(patch, (left.width - overlap, 0))
    return blended, {"x": seam, "gap": gaps[seam], "mean": mean, "overlap": overlap}


def heal_strong_seams(image: Image.Image, overlap: int, max_passes: int = 6) -> tuple[Image.Image, list[dict]]:
    """Heal multiple independent generated joins, strongest first."""
    healed = image
    reports: list[dict] = []
    for _ in range(max_passes):
        next_image, report = heal_one_seam(healed, overlap)
        if report is None:
            break
        healed = next_image
        reports.append(report)
    return healed, reports


def verify(image: Image.Image, max_ratio: float = 4.0) -> tuple[int, float, float]:
    gaps = column_gaps(image)
    mean = sum(gaps) / len(gaps)
    worst = max(range(len(gaps)), key=gaps.__getitem__)
    ratio = gaps[worst] / mean if mean else 0.0
    if ratio > max_ratio:
        raise ValueError(
            f"worst vertical seam x={worst} is {ratio:.1f}x mean ({gaps[worst]:.2f}/{mean:.2f})"
        )
    return worst, ratio, mean


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("destination")
    parser.add_argument("--overlap", type=int, default=192)
    parser.add_argument("--keep-top", type=int, default=0)
    parser.add_argument("--tolerance", type=int, default=90)
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--max-heals", type=int, default=6)
    args = parser.parse_args()

    source = Path(args.source)
    destination = Path(args.destination)
    image = Image.open(source)
    print(f"in    {source} {image.width}x{image.height} {image.mode}")

    keyed = key_magenta(image, args.tolerance)
    cropped = crop_transparent_rows(keyed)
    print(f"key   {cropped.width}x{cropped.height}")

    if args.keep_top:
        cropped = cropped.crop((0, 0, cropped.width, min(args.keep_top, cropped.height)))
        print(f"crop  skyline top {cropped.height}px")

    healed, reports = heal_strong_seams(cropped, args.overlap, args.max_heals)
    if reports:
        for index, seam in enumerate(reports, start=1):
            print(
                f"heal{index} x={seam['x']} {seam['gap'] / seam['mean']:.1f}x mean "
                f"over {seam['overlap']}px"
            )
    else:
        print("heal  no strong interior seam")

    worst, ratio, _ = verify(healed)
    print(f"check worst x={worst} {ratio:.2f}x mean")

    destination.parent.mkdir(parents=True, exist_ok=True)
    healed.save(destination, "WEBP", quality=args.quality, method=6)
    print(f"out   {destination} {healed.width}x{healed.height} {destination.stat().st_size // 1024}KB")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        raise SystemExit(1)
