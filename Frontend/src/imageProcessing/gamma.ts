import type { Mat } from "@techstark/opencv-js";

import type { OpenCV } from "./opencv";

export type GammaParams = {
  /** 1 = no change; above 1 brightens mid-tones, below 1 darkens them */
  gamma: number;
  /** Image range the curve is normalised over; these end points stay fixed */
  min: number;
  max: number;
};

/**
 * Gamma curve: Y' = min + range * n^(1/gamma), with n = (Y - min) / range.
 * `src` must be CV_32FC1; returns a new CV_32FC1 Mat the caller must delete.
 */
export function applyGamma(
  cv: OpenCV,
  src: Mat,
  { gamma, min, max }: GammaParams,
): Mat {
  const result = new cv.Mat(src.rows, src.cols, cv.CV_32FC1);

  const source = src.data32F;
  const output = result.data32F;
  const range = max - min;

  // Flat image: nothing to bend
  if (range <= 0) {
    output.set(source);
    return result;
  }

  const exponent = 1 / gamma;

  for (let i = 0; i < source.length; i++) {
    // Clamp: earlier filters (e.g. USM overshoot) can step outside the range
    const normalized = Math.min(Math.max((source[i] - min) / range, 0), 1);

    output[i] = min + range * normalized ** exponent;
  }

  return result;
}
