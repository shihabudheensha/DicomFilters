import { useEffect, useRef, useState } from "react";
import {
  RenderingEngine,
  Enums,
  eventTarget,
  utilities,
  type Types,
} from "@cornerstonejs/core";
import { initCornerstone } from "../cornerstone/initCornerstone";
import { initOpenCV } from "../imageProcessing/opencv";
import { processImage } from "../imageProcessing/filterPipeline";
import {
  DEFAULT_FILTER_SETTINGS,
  FILTER_CONTROLS,
  type FilterKey,
  type FilterSettings,
} from "../imageProcessing/filterConfig";
import { getMinMax } from "../imageProcessing/pixelUtils";

// Slider groups in pipeline order: Smoothing, then Unsharp Mask
const FILTER_GROUPS = [...new Set(FILTER_CONTROLS.map((c) => c.group))];

const { ViewportType } = Enums;

const renderingEngineId = "tigerview9RenderingEngine";
const viewportId = "tigerview9Viewport";

const dicomUrl = "https://localhost:7099/api/dicom/instance-0005.dcm";
const originalImageId = `wadouri:${dicomUrl}`;

export default function DicomViewer() {
  const elementRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Types.IStackViewport | null>(null);
  // Untouched copy of the DICOM pixels; every filter run starts from this
  const originalPixelDataRef = useRef<Uint16Array | null>(null);
  const imageWidthRef = useRef<number>(0);
  const imageHeightRef = useRef<number>(0);
  // max − min of the original pixels; USM threshold is a fraction of this
  const pixelRangeRef = useRef<number>(0);
  // Lets a newer filter run win over a slower older one
  const filterRequestRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  // Defaults leave every filter off, i.e. the unfiltered DICOM shown on load
  const [settings, setSettings] = useState<FilterSettings>(
    DEFAULT_FILTER_SETTINGS,
  );

  useEffect(() => {
    let renderingEngine: RenderingEngine | undefined;
    // React StrictMode mounts twice in dev; stop the stale run after cleanup
    let cancelled = false;

    // StackViewport swallows load failures and only fires this event
    const onImageLoadError = (event: Event) => {
      console.error("Image load error:", (event as CustomEvent).detail);
    };

    eventTarget.addEventListener(
      Enums.Events.IMAGE_LOAD_ERROR,
      onImageLoadError,
    );

    async function loadDicom() {
      if (!elementRef.current) {
        return;
      }

      try {
        await initCornerstone();
        await initOpenCV();
        console.log("OpenCV ready");

        if (cancelled) {
          return;
        }

        renderingEngine = new RenderingEngine(renderingEngineId);

        const viewportInput: Types.PublicViewportInput = {
          viewportId,
          element: elementRef.current,
          type: ViewportType.STACK,
        };

        renderingEngine.enableElement(viewportInput);

        const viewport = renderingEngine.getViewport(
          viewportId,
        ) as Types.IStackViewport;

        await viewport.setStack([originalImageId], 0);

        if (cancelled) {
          return;
        }

        viewport.render();

        const imageData = viewport.getImageData();

        if (!imageData) {
          throw new Error("No image data");
        }

        const width = imageData.dimensions[0];
        const height = imageData.dimensions[1];

        console.log("Width:", width);
        console.log("Height:", height);

        if (!(imageData.scalarData instanceof Uint16Array)) {
          throw new Error(
            `Expected Uint16Array but got ${imageData.scalarData.constructor.name}`,
          );
        }

        // --------------------------------
        // Keep ORIGINAL pixels for processing / reset
        // --------------------------------

        const originalPixelData = new Uint16Array(imageData.scalarData);
        const { min, max } = getMinMax(originalPixelData);

        console.log("Pixel range:", min, "–", max);

        originalPixelDataRef.current = originalPixelData;
        pixelRangeRef.current = max - min;
        imageWidthRef.current = width;
        imageHeightRef.current = height;
        viewportRef.current = viewport;

        setReady(true);
      } catch (error) {
        console.error("DICOM loading failed:", error);
      }
    }

    loadDicom();

    return () => {
      cancelled = true;
      eventTarget.removeEventListener(
        Enums.Events.IMAGE_LOAD_ERROR,
        onImageLoadError,
      );
      viewportRef.current = null;
      setReady(false);
      renderingEngine?.destroy();
    };
  }, []);

  // Write pixels into the loaded image and redraw, without reloading the stack
  function displayPixels(pixels: Uint16Array) {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const image = viewport.getCornerstoneImage();

    if (!image?.voxelManager) {
      console.error("No Cornerstone image loaded");
      return;
    }

    const vtkImageData = viewport
      .getDefaultActor()
      ?.actor.getMapper()
      ?.getInputData();

    if (!vtkImageData) {
      console.error("No VTK image data found");
      return;
    }

    // 1. Update the Cornerstone image (what tools read, and what the viewport
    //    re-syncs VTK from on the next image change)
    image.voxelManager.getScalarData().set(pixels);

    // 2. Copy it into the VTK image data that is actually rendered
    utilities.updateVTKImageDataWithCornerstoneImage(vtkImageData, image);

    viewport.render();

    logDifference(vtkImageData.getPointData().getScalars().getData());
  }

  function logDifference(renderedPixels: ArrayLike<number>) {
    const originalPixelData = originalPixelDataRef.current;

    if (!originalPixelData) {
      return;
    }

    let changedPixels = 0;
    let maxDifference = 0;

    for (let i = 0; i < originalPixelData.length; i++) {
      const difference = Math.abs(renderedPixels[i] - originalPixelData[i]);

      if (difference > 0) {
        changedPixels++;
      }

      if (difference > maxDifference) {
        maxDifference = difference;
      }
    }

    console.log("Changed pixels:", changedPixels, "/", originalPixelData.length);
    console.log("Max difference:", maxDifference);
  }

  async function runFilters(nextSettings: FilterSettings) {
    const originalPixelData = originalPixelDataRef.current;

    if (!originalPixelData) {
      return;
    }

    const requestId = ++filterRequestRef.current;

    setProcessing(true);

    try {
      // Always filter from the original, never from the previous result
      const processedPixelData = await processImage(
        originalPixelData,
        imageWidthRef.current,
        imageHeightRef.current,
        pixelRangeRef.current,
        nextSettings,
      );

      if (requestId !== filterRequestRef.current) {
        return;
      }

      displayPixels(processedPixelData);
    } catch (error) {
      console.error("Filtering failed:", error);
    } finally {
      if (requestId === filterRequestRef.current) {
        setProcessing(false);
      }
    }
  }

  function handleReset() {
    const originalPixelData = originalPixelDataRef.current;

    if (!originalPixelData) {
      return;
    }

    // Invalidate any filter run still in flight
    filterRequestRef.current++;
    setProcessing(false);
    setSettings(DEFAULT_FILTER_SETTINGS);

    displayPixels(originalPixelData);
  }

  function updateSetting(key: FilterKey, value: number) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  // Run on slider release; build settings from the released value so a
  // not-yet-rendered state update can't make us filter with a stale value
  function commitSetting(key: FilterKey, value: number) {
    const nextSettings = { ...settings, [key]: value };

    setSettings(nextSettings);
    runFilters(nextSettings);
  }

  return (
    <div>
      <div className="viewer-toolbar">
        {FILTER_GROUPS.map((group) => (
          <fieldset key={group} className="filter-group" disabled={!ready}>
            <legend>{group}</legend>
            {FILTER_CONTROLS.filter((control) => control.group === group).map(
              (control) => (
                <label key={control.key} className="filter-control">
                  <span className="filter-label">{control.label}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings[control.key]}
                    onChange={(event) =>
                      updateSetting(control.key, Number(event.target.value))
                    }
                    // Filter when the user lets go, not on every drag tick
                    onPointerUp={(event) =>
                      commitSetting(
                        control.key,
                        Number(event.currentTarget.value),
                      )
                    }
                    onKeyUp={(event) =>
                      commitSetting(
                        control.key,
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                  <span className="filter-value">
                    {control.format(settings[control.key])}
                  </span>
                </label>
              ),
            )}
          </fieldset>
        ))}
        <div className="filter-actions">
          <button disabled={!ready} onClick={handleReset}>
            Reset
          </button>
          {processing && <span>Processing…</span>}
        </div>
      </div>
      <div ref={elementRef} className="cornerstone-viewport" />
    </div>
  );
}
