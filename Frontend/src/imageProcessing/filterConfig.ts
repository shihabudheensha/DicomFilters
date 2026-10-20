// Sliders work in percent (0–100), except gamma, which is −100…+100 around
// neutral. These functions map a slider value to the real filter parameter,
// so ranges/curves can be tuned here without touching the UI. Pixel values
// are image pixels, never relative to image size.

export type FilterSettings = {
  smoothing: number;
  usmAmount: number;
  usmRadius: number;
  usmThreshold: number;
  gamma: number;
};

export type FilterKey = keyof FilterSettings;

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  smoothing: 0,
  usmAmount: 0,
  usmRadius: 20,
  usmThreshold: 0,
  gamma: 0,
};

/** True when every filter value matches, i.e. a re-run would change nothing */
export function areFilterSettingsEqual(a: FilterSettings, b: FilterSettings) {
  return (Object.keys(a) as FilterKey[]).every((key) => a[key] === b[key]);
}

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

/**
 * Gamma 0.25–4.00 on a log scale (0 = 1.00 = off), so darker and brighter
 * get equal slider travel: −50 → 0.50, +50 → 2.00
 */
export const gammaValue = (value: number) => 4 ** (value / 100);

export type FilterControl = {
  key: FilterKey;
  label: string;
  group: string;
  /** Slider bounds; default 0–100 */
  min?: number;
  max?: number;
  format: (value: number) => string;
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
  {
    key: "gamma",
    label: "Amount",
    group: "Gamma",
    min: -100,
    max: 100,
    format: (v) => `γ ${gammaValue(v).toFixed(2)}`,
  },
];
