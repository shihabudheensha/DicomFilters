import type { Mat } from "@techstark/opencv-js";

import { applyContrast } from "./contrast";
import {
  contrastFactor,
  gammaValue,
  smoothingSigma,
  usmRadiusSigma,
  usmStrength,
  usmThresholdFraction,
  type FilterSettings,
} from "./filterConfig";
import { applyGamma } from "./gamma";
import { initOpenCV, type OpenCV } from "./opencv";
import {
  getComponentCount,
  toLuminance,
  type PixelArray,
} from "./pixelUtils";
import { smooth } from "./smoothing";
import { unsharpMask } from "./unsharpMask";

type MatFormat = {
  type: number;
  view: (mat: Mat) => PixelArray;
};

/** OpenCV Mat type and data view matching each grayscale pixel array */
function getMatFormat(cv: OpenCV, pixels: PixelArray): MatFormat {
  if (pixels instanceof Uint8Array) {
    return { type: cv.CV_8UC1, view: (mat) => mat.data };
  }

  if (pixels instanceof Int8Array) {
    return { type: cv.CV_8SC1, view: (mat) => mat.data8S };
  }

  if (pixels instanceof Uint16Array) {
    return { type: cv.CV_16UC1, view: (mat) => mat.data16U };
  }

  if (pixels instanceof Int16Array) {
    return { type: cv.CV_16SC1, view: (mat) => mat.data16S };
  }

  return { type: cv.CV_32FC1, view: (mat) => mat.data32F };
}

/**
 * Puts the filtered brightness back into a colour image: R, G and B shift by
 * the same brightness change, so hue is kept and sharpened edges get no
 * colour fringes. Alpha is untouched. (Grayscale skips this step.)
 */
function recombine(
  original: PixelArray,
  components: number,
  luminance: Float32Array,
  filteredLuminance: Float32Array,
): Float32Array {
  const output = Float32Array.from(original);

  for (let i = 0, p = 0; i < luminance.length; i++, p += components) {
    const delta = filteredLuminance[i] - luminance[i];

    output[p] += delta;
    output[p + 1] += delta;
    output[p + 2] += delta;
  }

  return output;
}

/**
 * Runs Original → Smoothing → Unsharp Mask → Contrast → Gamma, always
 * starting from the original pixels. Grayscale and colour (RGB/RGBA) are both handled by
 * filtering brightness (luminance) only, then recombining.
 * Works in Float32 internally so subtracting a blur never underflows; the
 * final convert back to the source type rounds and clamps to that type's
 * range (e.g. 0–255 for 8-bit, 0–65535 for Uint16).
 * Returns an array of the same type and length as `original`; when every
 * filter is off this is `original` itself (callers copy it, never mutate it).
 */
export async function processImage<T extends PixelArray>(
  original: T,
  width: number,
  height: number,
  luminanceRange: { min: number; max: number },
  settings: FilterSettings,
): Promise<T> {
  const pixelRange = luminanceRange.max - luminanceRange.min;
  const sigma = smoothingSigma(settings.smoothing);
  const strength = usmStrength(settings.usmAmount);
  const radiusSigma = usmRadiusSigma(settings.usmRadius);
  const threshold = usmThresholdFraction(settings.usmThreshold) * pixelRange;
  const factor = contrastFactor(settings.contrast);
  const gamma = gammaValue(settings.gamma);

  if (sigma <= 0 && strength <= 0 && factor === 1 && gamma === 1) {
    return original;
  }

  const components = getComponentCount(original, width, height);

  if (components !== 1 && components !== 3 && components !== 4) {
    throw new Error(`Unsupported pixel layout (${components} components)`);
  }

  const cv = await initOpenCV();
  const format = getMatFormat(cv, original);

  console.log("Filter pipeline:", {
    pixelType: original.constructor.name,
    components,
    smoothingSigma: sigma,
    usmStrength: strength,
    usmRadiusSigma: radiusSigma,
    usmThreshold: threshold,
    contrast: factor,
    gamma,
  });

  const mats: Mat[] = [];

  // Tracks every Mat so all of them are freed, even if a step throws
  const track = (mat: Mat) => {
    mats.push(mat);
    return mat;
  };

  // Swaps in a step's output and frees the Mat it replaces right away, so
  // intermediate results don't pile up in WASM memory until the end
  const replace = (previous: Mat, next: Mat) => {
    track(next);
    mats.splice(mats.indexOf(previous), 1);
    previous.delete();
    return next;
  };

  try {
    let current = track(new cv.Mat(height, width, cv.CV_32FC1));

    // Grayscale: the brightness plane is the pixels themselves; .set converts
    // the element type exactly as Float32Array.from would, without the copy
    const luminance =
      components === 1 ? null : toLuminance(original, components);

    current.data32F.set(luminance ?? original);

    if (sigma > 0) {
      current = replace(current, smooth(cv, current, sigma));
    }

    if (strength > 0) {
      current = replace(
        current,
        unsharpMask(cv, current, { strength, radiusSigma, threshold }),
      );
    }

    // Tone adjustments last, after detail processing: the linear contrast
    // stretch first, then the gamma curve within the same range
    if (factor !== 1) {
      current = replace(
        current,
        applyContrast(cv, current, { factor, ...luminanceRange }),
      );
    }

    if (gamma !== 1) {
      current = replace(
        current,
        applyGamma(cv, current, { gamma, ...luminanceRange }),
      );
    }

    // Grayscale: the filtered plane already has the output layout, so convert
    // it directly (same saturating conversion as the colour path)
    if (!luminance) {
      if (original instanceof Float32Array) {
        return current.data32F.slice() as T;
      }

      const result = track(new cv.Mat());
      current.convertTo(result, format.type);

      return format.view(result).slice() as T;
    }

    // Colour: copy out of OpenCV memory before the Mats are freed
    const recombined = recombine(
      original,
      components,
      luminance,
      current.data32F.slice(),
    );

    if (original instanceof Float32Array) {
      return recombined as T;
    }

    // Interleaved samples as one row-per-image-row Mat; convertTo works per
    // element, saturating to the source type's range
    const combined = track(
      new cv.Mat(height, width * components, cv.CV_32FC1),
    );
    combined.data32F.set(recombined);

    const result = track(new cv.Mat());
    combined.convertTo(result, format.type);

    // Copy out of OpenCV memory into an array of the original type
    return format.view(result).slice() as T;
  } finally {
    mats.forEach((mat) => mat.delete());
  }
}
