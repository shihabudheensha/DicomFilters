import type { Mat } from "@techstark/opencv-js";

import type { OpenCV } from "./opencv";

/** Gaussian kernel size covering +/- 3 sigma (always odd) */
export function gaussianKernelSize(sigma: number) {
  return 2 * Math.ceil(3 * sigma) + 1;
}

/**
 * Gaussian smoothing to reduce noise/grain.
 * `src` must be CV_32FC1; returns a new Mat the caller must delete.
 */
export function smooth(cv: OpenCV, src: Mat, sigma: number): Mat {
  const kernelSize = gaussianKernelSize(sigma);
  const smoothed = new cv.Mat();

  cv.GaussianBlur(
    src,
    smoothed,
    new cv.Size(kernelSize, kernelSize),
    sigma,
    sigma,
    cv.BORDER_DEFAULT,
  );

  return smoothed;
}
