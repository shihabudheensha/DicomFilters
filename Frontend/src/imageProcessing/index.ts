// Public API of the image-processing module. Import only from this file
// (e.g. `from "../imageProcessing"`); everything else is internal.

export {
  areFilterSettingsEqual,
  DEFAULT_FILTER_SETTINGS,
  FILTER_CONTROLS,
  type FilterControl,
  type FilterKey,
  type FilterSettings,
} from "./filterConfig";
export { processImage } from "./filterPipeline";
export { initOpenCV } from "./opencv";
export { isPixelArray, type PixelArray } from "./pixelUtils";
export {
  useViewportFilters,
  type ViewportFilters,
} from "./useViewportFilters";
export {
  createViewportFilter,
  type ViewportFilter,
  type ViewportFilterOptions,
} from "./viewportFilter";
