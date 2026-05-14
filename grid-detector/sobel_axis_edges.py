# /// script
# requires-python = ">=3.9"
# dependencies = ["pillow", "numpy"]
# ///
"""Sobel edge detection, keeping only near-axis-aligned edges."""

from pathlib import Path
import numpy as np
from PIL import Image

INPUT = Path(__file__).parent / "map.webp"
OUTPUT = Path(__file__).parent / "map_sobel_axis.png"
OUTPUT_ALL = Path(__file__).parent / "map_sobel_all.png"
OUTPUT_BINARY = Path(__file__).parent / "map_sobel_axis_binary.png"

ANGLE_TOL_DEG = 5.0
MAG_PERCENTILE = 90


def conv2_same(image: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    kh, kw = kernel.shape
    ph, pw = kh // 2, kw // 2
    padded = np.pad(image, ((ph, ph), (pw, pw)), mode="edge")
    H, W = image.shape
    out = np.zeros((H, W), dtype=np.float64)
    for i in range(kh):
        for j in range(kw):
            out += kernel[i, j] * padded[i : i + H, j : j + W]
    return out


def main() -> None:
    img = Image.open(INPUT).convert("L")
    arr = np.asarray(img, dtype=np.float64)

    Kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float64)
    Ky = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float64)

    Gx = conv2_same(arr, Kx)
    Gy = conv2_same(arr, Ky)

    magnitude = np.hypot(Gx, Gy)

    mag_max = magnitude.max()
    if mag_max > 0:
        all_scaled = (magnitude / mag_max * 255.0).clip(0, 255).astype(np.uint8)
    else:
        all_scaled = magnitude.astype(np.uint8)
    Image.fromarray(all_scaled, mode="L").save(OUTPUT_ALL)

    eps = 1e-8
    tol = np.tan(np.deg2rad(ANGLE_TOL_DEG))
    abs_x = np.abs(Gx)
    abs_y = np.abs(Gy)

    vertical_edge = (abs_y / (abs_x + eps)) < tol
    horizontal_edge = (abs_x / (abs_y + eps)) < tol
    axis_aligned = vertical_edge | horizontal_edge

    binary = np.where(axis_aligned, 255, 0).astype(np.uint8)
    Image.fromarray(binary, mode="L").save(OUTPUT_BINARY)

    mag_threshold = np.percentile(magnitude, MAG_PERCENTILE)
    strong = magnitude > mag_threshold

    keep = axis_aligned & strong
    filtered = np.where(keep, magnitude, 0.0)

    max_val = filtered.max()
    if max_val > 0:
        scaled = (filtered / max_val * 255.0).clip(0, 255).astype(np.uint8)
    else:
        scaled = filtered.astype(np.uint8)

    Image.fromarray(scaled, mode="L").save(OUTPUT)
    kept_pct = 100.0 * keep.sum() / keep.size
    print(f"wrote {OUTPUT_ALL} (full Sobel magnitude)")
    print(f"wrote {OUTPUT_BINARY} (binary: axis-aligned orientation, magnitude ignored)")
    print(f"wrote {OUTPUT}")
    print(f"  size: {scaled.shape[1]}x{scaled.shape[0]}")
    print(f"  magnitude p{MAG_PERCENTILE} threshold: {mag_threshold:.1f}")
    print(f"  angle tolerance: ±{ANGLE_TOL_DEG}°")
    print(f"  pixels kept: {keep.sum()} ({kept_pct:.2f}%)")


if __name__ == "__main__":
    main()
