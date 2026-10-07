import type { Mat } from "@techstark/opencv-js";

import type { OpenCV } from "./opencv";
import { smooth } from "./smoothing";

export type UnsharpMaskParams = {
  /** Detail multiplier (0 = off) */
  strength: number;
  /** Blur sigma in pixels; how wide around an edge is sharpened */
  radiusSigma: number;
  /** Minimum detail (in pixel value units) before sharpening applies */
  threshold: number;
};

/**
 * Unsharp mask: out = src + strength * softThreshold(src - blur(src)).
 * `src` must be CV_32FC1; returns a new CV_32FC1 Mat the caller must delete.
 */
export function unsharpMask(
  cv: OpenCV,
  src: Mat,
  { strength, radiusSigma, threshold }: UnsharpMaskParams,
): Mat {
  const blurred = smooth(cv, src, radiusSigma);

  try {
    const result = new cv.Mat(src.rows, src.cols, cv.CV_32FC1);

    const source = src.data32F;
    const blur = blurred.data32F;
    const output = result.data32F;

    for (let i = 0; i < source.length; i++) {
      const detail = source[i] - blur[i];
      const magnitude = Math.abs(detail) - threshold;

      // Soft threshold: shrink detail toward 0 instead of cutting it off,
      // which avoids blotchy patches where sharpening switches on/off
      const kept = magnitude > 0 ? Math.sign(detail) * magnitude : 0;

      output[i] = source[i] + strength * kept;
    }

    return result;
  } finally {
    blurred.delete();
  }
}
