#!/usr/bin/env python3
"""Prepare magenta-keyed horizon art for Liora Farm.

Pipeline:
  magenta key -> despill -> crop transparent rows -> optional skyline crop
  -> heal only catastrophic interior joins -> verify the real left/right wrap
  -> WebP

Generated treelines naturally contain sharp vertical edges at trunks and canopy
clumps. Those are not seams. The guard therefore treats the outer wrap as its
own invariant and only heals an interior join when it is a true statistical
outlier, rather than repeatedly blurring normal artwork.
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
    """Premultiplied RGBA difference for every vertical join, wrap included."""
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


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = round((len(ordered) - 1) * fraction)
    return ordered[max(0, min(len(ordered) - 1, index))]


def gap_stats(image: Image.Image) -> dict:
    gaps = column_gaps(image)
    interior = gaps[:-1]
    mean = sum(interior) / len(interior) if interior else 0.0
    p95 = percentile(interior, 0.95)
    worst_x = max(range(len(interior)), key=interior.__getitem__) if interior else 0
    worst = interior[worst_x] if interior else 0.0
    wrap = gaps[-1] if gaps else 0.0
    return {
        "gaps": gaps,
        "mean": mean,
        "p95": p95,
        "worst_x": worst_x,
        "worst": worst,
        "wrap": wrap,
        "worst_mean_ratio": worst / mean if mean else 0.0,
        "worst_p95_ratio": worst / p95 if p95 else 0.0,
        "wrap_mean_ratio": wrap / mean if mean else 0.0,
        "wrap_p95_ratio": wrap / p95 if p95 else 0.0,
    }


def is_catastrophic(stats: dict) -> bool:
    """A generated cut, not an ordinary tree/grass edge."""
    return stats["worst"] > max(stats["mean"] * 8.0, stats["p95"] * 3.0)


def heal_one_catastrophic_seam(image: Image.Image, overlap: int) -> tuple[Image.Image, dict | None]:
    stats = gap_stats(image)
    seam = stats["worst_x"]
    width, height = image.size
    if not is_catastrophic(stats):
        return image, None
    if min(seam, width - 1 - seam) < overlap * 2:
        raise ValueError(
            f"catastrophic join x={seam} is too close to the wrap to heal safely"
        )

    left = image.crop((0, 0, seam + 1, height))
    right = image.crop((seam + 1, 0, width, height))
    if left.width <= overlap or right.width <= overlap:
        raise ValueError(f"catastrophic join x={seam} has too little artwork around it")

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
    return blended, stats


def heal_catastrophic_seams(image: Image.Image, overlap: int, max_passes: int = 3) -> tuple[Image.Image, list[dict]]:
    healed = image
    reports: list[dict] = []
    for _ in range(max_passes):
        next_image, report = heal_one_catastrophic_seam(healed, overlap)
        if report is None:
            break
        healed = next_image
        reports.append(report)
    return healed, reports


def verify(image: Image.Image) -> dict:
    stats = gap_stats(image)
    if is_catastrophic(stats):
        raise ValueError(
            f"interior join x={stats['worst_x']} is still catastrophic: "
            f"{stats['worst_mean_ratio']:.1f}x mean / {stats['worst_p95_ratio']:.1f}x p95"
        )

    # This is the seam users actually see when the cylinder wraps. It may be a
    # little sharper than an average tree edge, but it must not be an outlier.
    if stats["wrap"] > max(stats["mean"] * 4.0, stats["p95"] * 2.5):
        raise ValueError(
            f"left/right wrap is not seamless: {stats['wrap_mean_ratio']:.1f}x mean / "
            f"{stats['wrap_p95_ratio']:.1f}x p95"
        )
    return stats


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("destination")
    parser.add_argument("--overlap", type=int, default=192)
    parser.add_argument("--keep-top", type=int, default=0)
    parser.add_argument("--tolerance", type=int, default=90)
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--max-heals", type=int, default=3)
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

    healed, reports = heal_catastrophic_seams(cropped, args.overlap, args.max_heals)
    if reports:
        for index, seam in enumerate(reports, start=1):
            print(
                f"heal{index} x={seam['worst_x']} "
                f"{seam['worst_mean_ratio']:.1f}x mean / {seam['worst_p95_ratio']:.1f}x p95 "
                f"over {args.overlap}px"
            )
    else:
        print("heal  no catastrophic interior join")

    stats = verify(healed)
    print(
        f"check interior x={stats['worst_x']} {stats['worst_mean_ratio']:.2f}x mean / "
        f"{stats['worst_p95_ratio']:.2f}x p95; wrap "
        f"{stats['wrap_mean_ratio']:.2f}x mean / {stats['wrap_p95_ratio']:.2f}x p95"
    )

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
