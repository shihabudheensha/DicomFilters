// Sliders work in percent (0–100). These functions map a percentage to the
// real filter parameter, so ranges/curves can be tuned here without touching
// the UI. Pixel values are image pixels, never relative to image size.

export type FilterSettings = {
  smoothing: number;
  usmAmount: number;
  usmRadius: number;
  usmThreshold: number;
};

export type FilterKey = keyof FilterSettings;

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  smoothing: 0,
  usmAmount: 0,
  usmRadius: 20,
  usmThreshold: 0,
};

const fraction = (percent: number) => percent / 100;

// Squared curves give finer control at the low end, where useful values are

/** Gaussian sigma in pixels, 0–5 (0 = off) */
export const smoothingSigma = (percent: number) => 5 * fraction(percent) ** 2;

/** Detail multiplier, 0–3 (0 = off) */
export const usmStrength = (percent: number) => 3 * fraction(percent);

/** Blur sigma in pixels used to extract edge detail, 0.5–20 */
export const usmRadiusSigma = (percent: number) =>
  0.5 + 19.5 * fraction(percent) ** 2;

/** Fraction of the image's pixel range (max − min), 0–0.1 */
export const usmThresholdFraction = (percent: number) => 0.1 * fraction(percent);

export type FilterControl = {
  key: FilterKey;
  label: string;
  group: string;
  format: (percent: number) => string;
};

export const FILTER_CONTROLS: FilterControl[] = [
  {
    key: "smoothing",
    label: "Amount",
    group: "Smoothing",
    format: (p) => `${p} % (σ ${smoothingSigma(p).toFixed(2)} px)`,
  },
  {
    key: "usmAmount",
    label: "Amount",
    group: "Unsharp Mask",
    format: (p) => `${p} % (×${usmStrength(p).toFixed(2)})`,
  },
  {
    key: "usmRadius",
    label: "Radius",
    group: "Unsharp Mask",
    format: (p) => `${p} % (σ ${usmRadiusSigma(p).toFixed(2)} px)`,
  },
  {
    key: "usmThreshold",
    label: "Threshold",
    group: "Unsharp Mask",
    format: (p) =>
      `${p} % (${(usmThresholdFraction(p) * 100).toFixed(1)} % of range)`,
  },
];
