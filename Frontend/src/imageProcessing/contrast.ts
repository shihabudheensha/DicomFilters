import type { Mat } from "@techstark/opencv-js";

import type { OpenCV } from "./opencv";

export type ContrastParams = {
  /** 1 = no change; above 1 spreads light/dark apart, below 1 flattens */
  factor: number;
  /** Image range; contrast pivots on its midpoint and is clamped to it */
  min: number;
  max: number;
};

/**
 * Contrast stretch: Y' = clamp(mid + factor * (Y - mid), min, max), with
 * mid = (min + max) / 2, so higher contrast saturates to the image's own
 * black and white instead of creating new values.
 * `src` must be CV_32FC1; returns a new CV_32FC1 Mat the caller must delete.
 */
export function applyContrast(
  cv: OpenCV,
  src: Mat,
  { factor, min, max }: ContrastParams,
): Mat {
  const result = new cv.Mat(src.rows, src.cols, cv.CV_32FC1);

  const source = src.data32F;
  const output = result.data32F;
  const mid = (min + max) / 2;

  for (let i = 0; i < source.length; i++) {
    const stretched = mid + factor * (source[i] - mid);

    output[i] = Math.min(Math.max(stretched, min), max);
  }

  return result;
}
