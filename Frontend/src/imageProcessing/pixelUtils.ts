/** Grayscale pixel buffers Cornerstone can hand us, depending on the DICOM */
export type PixelArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Float32Array;

export function isPixelArray(data: unknown): data is PixelArray {
  return (
    data instanceof Uint8Array ||
    data instanceof Int8Array ||
    data instanceof Uint16Array ||
    data instanceof Int16Array ||
    data instanceof Float32Array
  );
}

/** Interleaved samples per pixel: 1 = grayscale, 3 = RGB, 4 = RGBA */
export function getComponentCount(
  pixels: PixelArray,
  width: number,
  height: number,
) {
  return pixels.length / (width * height);
}

/**
 * Brightness plane (one value per pixel). Grayscale is copied as is;
 * colour uses Rec. 601 luma, Y = 0.299 R + 0.587 G + 0.114 B (alpha ignored).
 */
export function toLuminance(
  pixels: PixelArray,
  components: number,
): Float32Array {
  if (components === 1) {
    return Float32Array.from(pixels);
  }

  const luminance = new Float32Array(pixels.length / components);

  for (let i = 0, p = 0; i < luminance.length; i++, p += components) {
    luminance[i] =
      0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
  }

  return luminance;
}

export function getMinMax(
  pixelData: PixelArray
): {
  min: number;
  max: number;
} {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < pixelData.length; i++) {
    const value = pixelData[i];

    if (value < min) {
      min = value;
    }

    if (value > max) {
      max = value;
    }
  }

  return { min, max };
}
