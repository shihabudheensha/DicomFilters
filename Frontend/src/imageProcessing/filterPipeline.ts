import type { Mat } from "@techstark/opencv-js";

import {
  smoothingSigma,
  usmRadiusSigma,
  usmStrength,
  usmThresholdFraction,
  type FilterSettings,
} from "./filterConfig";
import { initOpenCV } from "./opencv";
import { smooth } from "./smoothing";
import { unsharpMask } from "./unsharpMask";

/**
 * Runs Original → Smoothing → Unsharp Mask, always starting from the
 * original pixels. Works in Float32 so subtracting a blur never underflows
 * Uint16; the final convert back rounds and clamps to 0–65535.
 */
export async function processImage(
  original: Uint16Array,
  width: number,
  height: number,
  pixelRange: number,
  settings: FilterSettings,
): Promise<Uint16Array> {
  const sigma = smoothingSigma(settings.smoothing);
  const strength = usmStrength(settings.usmAmount);
  const radiusSigma = usmRadiusSigma(settings.usmRadius);
  const threshold = usmThresholdFraction(settings.usmThreshold) * pixelRange;

  if (sigma <= 0 && strength <= 0) {
    return new Uint16Array(original);
  }

  const cv = await initOpenCV();

  console.log("Filter pipeline:", {
    smoothingSigma: sigma,
    usmStrength: strength,
    usmRadiusSigma: radiusSigma,
    usmThreshold: threshold,
  });

  const mats: Mat[] = [];

  // Tracks every Mat so all of them are freed, even if a step throws
  const track = (mat: Mat) => {
    mats.push(mat);
    return mat;
  };

  try {
    const source16 = track(new cv.Mat(height, width, cv.CV_16UC1));
    source16.data16U.set(original);

    let current = track(new cv.Mat());
    source16.convertTo(current, cv.CV_32F);

    if (sigma > 0) {
      current = track(smooth(cv, current, sigma));
    }

    if (strength > 0) {
      current = track(
        unsharpMask(cv, current, { strength, radiusSigma, threshold }),
      );
    }

    const result16 = track(new cv.Mat());
    current.convertTo(result16, cv.CV_16U);

    return new Uint16Array(result16.data16U);
  } finally {
    mats.forEach((mat) => mat.delete());
  }
}
