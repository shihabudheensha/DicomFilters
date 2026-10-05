export function getMinMax(
  pixelData: Uint16Array
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