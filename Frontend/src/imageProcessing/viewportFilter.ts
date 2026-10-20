import { utilities, type Types } from "@cornerstonejs/core";

import {
  areFilterSettingsEqual,
  DEFAULT_FILTER_SETTINGS,
  type FilterSettings,
} from "./filterConfig";
import { processImage } from "./filterPipeline";
import {
  getComponentCount,
  getMinMax,
  isPixelArray,
  toLuminance,
  type PixelArray,
} from "./pixelUtils";

export type ViewportFilterOptions = {
  /** Logs image info, pipeline values and changed-pixel stats per preview */
  debug?: boolean;
};

/** Applies the filter pipeline to the image shown in one StackViewport */
export type ViewportFilter = {
  /** False when the image's pixel data can't be filtered */
  readonly supported: boolean;
  readonly unsupportedReason: string | null;
  /** Settings currently shown in the viewport */
  readonly appliedSettings: FilterSettings;
  /**
   * Filters from the original pixels and shows the result. Resolves false
   * when skipped (settings unchanged, unsupported image, or superseded by a
   * newer call); rejects if processing fails.
   */
  apply(settings: FilterSettings): Promise<boolean>;
  /** Shows the original pixels again and cancels any run in progress */
  reset(): void;
};

function unsupportedFilter(reason: string): ViewportFilter {
  return {
    supported: false,
    unsupportedReason: reason,
    appliedSettings: DEFAULT_FILTER_SETTINGS,
    apply: async () => false,
    reset: () => {},
  };
}

/**
 * Creates the filter for a StackViewport's current image. Call it after
 * `await viewport.setStack(...)` has loaded the image, and create a new one
 * whenever the viewport shows a different image. It keeps a copy of the
 * original pixels, so every run starts from the unfiltered image.
 */
export function createViewportFilter(
  viewport: Types.IStackViewport,
  { debug = false }: ViewportFilterOptions = {},
): ViewportFilter {
  const imageData = viewport.getImageData();

  if (!imageData) {
    throw new Error(
      "No image data: create the filter after setStack has loaded the image",
    );
  }

  const [width, height] = imageData.dimensions;
  const scalarData = imageData.scalarData;

  if (!isPixelArray(scalarData)) {
    return unsupportedFilter(
      `Unsupported pixel type: ${scalarData.constructor.name}`,
    );
  }

  // 1 = grayscale, 3 = RGB; 4 (RGBA) isn't expected with StackViewport
  const components = getComponentCount(scalarData, width, height);

  if (components !== 1 && components !== 3 && components !== 4) {
    return unsupportedFilter(
      `Unsupported pixel layout (${components} components)`,
    );
  }

  if (components === 4) {
    console.warn("Unexpected RGBA pixel data; filtering may misbehave");
  }

  // Untouched copy of the DICOM pixels; every filter run starts from this
  const original = scalarData.slice();
  // Filters work on brightness: USM threshold base and contrast/gamma range
  const luminanceRange = getMinMax(toLuminance(original, components));

  if (debug) {
    console.log("Viewport filter:", {
      width,
      height,
      pixelType: original.constructor.name,
      components,
      luminanceRange,
    });
  }

  // Lets a newer run win over a slower older one
  let latestRequest = 0;
  let appliedSettings = DEFAULT_FILTER_SETTINGS;

  // Write pixels into the loaded image and redraw, without reloading the stack
  function displayPixels(pixels: PixelArray) {
    const image = viewport.getCornerstoneImage();

    if (!image?.voxelManager) {
      throw new Error("No Cornerstone image loaded");
    }

    const vtkImageData = viewport
      .getDefaultActor()
      ?.actor.getMapper()
      ?.getInputData();

    if (!vtkImageData) {
      throw new Error("No VTK image data found");
    }

    // 1. Update the Cornerstone image (what tools read, and what the viewport
    //    re-syncs VTK from on the next image change)
    image.voxelManager.getScalarData().set(pixels);

    // 2. Copy it into the VTK image data that is actually rendered
    utilities.updateVTKImageDataWithCornerstoneImage(vtkImageData, image);

    viewport.render();

    if (debug) {
      logDifference(vtkImageData.getPointData().getScalars().getData());
    }
  }

  // Full-image pass comparing what's rendered against the original
  function logDifference(renderedPixels: ArrayLike<number>) {
    let changedPixels = 0;
    let maxDifference = 0;

    for (let i = 0; i < original.length; i++) {
      const difference = Math.abs(renderedPixels[i] - original[i]);

      if (difference > 0) {
        changedPixels++;
      }

      if (difference > maxDifference) {
        maxDifference = difference;
      }
    }

    console.log("Changed pixels:", changedPixels, "/", original.length);
    console.log("Max difference:", maxDifference);
  }

  return {
    supported: true,
    unsupportedReason: null,

    get appliedSettings() {
      return appliedSettings;
    },

    async apply(settings) {
      // e.g. clicking a slider without dragging, or Tab/Shift keyups
      if (areFilterSettingsEqual(settings, appliedSettings)) {
        return false;
      }

      const requestId = ++latestRequest;

      // Always filter from the original, never from the previous result
      const processed = await processImage(
        original,
        width,
        height,
        luminanceRange,
        settings,
        { debug },
      );

      if (requestId !== latestRequest) {
        return false;
      }

      displayPixels(processed);

      // Recorded only on success, so a failed run can be retried
      appliedSettings = settings;

      return true;
    },

    reset() {
      // Invalidate any run still in flight
      latestRequest++;
      appliedSettings = DEFAULT_FILTER_SETTINGS;

      displayPixels(original);
    },
  };
}
