import { useEffect, useRef, useState } from "react";
import {
  RenderingEngine,
  Enums,
  eventTarget,
  imageLoader,
  metaData,
  utilities,
  type Types,
} from "@cornerstonejs/core";
import { initCornerstone } from "../cornerstone/initCornerstone";
import { initOpenCV } from "../imageProcessing/opencv";
import { applySmoothing } from "../imageProcessing/smoothing";

const { ViewportType } = Enums;

const renderingEngineId = "tigerview9RenderingEngine";
const viewportId = "tigerview9Viewport";

const dicomUrl = "https://localhost:7099/api/dicom/instance-0005.dcm";
const originalImageId = `wadouri:${dicomUrl}`;

export default function DicomViewer() {
  const elementRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Types.IStackViewport | null>(null);
  const originalPixelDataRef = useRef<Uint16Array | null>(null);
  const imageWidthRef = useRef<number>(0);
  const imageHeightRef = useRef<number>(0);
  const voiRangeRef = useRef<Types.VOIRange | undefined>(undefined);

  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);

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
        // Keep ORIGINAL pixels for processing / comparison
        // --------------------------------

        originalPixelDataRef.current = new Uint16Array(imageData.scalarData);
        imageWidthRef.current = width;
        imageHeightRef.current = height;
        voiRangeRef.current = viewport.getProperties().voiRange;
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

  async function showImage(imageId: string) {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    await viewport.setStack([imageId], 0);

    // Keep the original window/level so the comparison is fair
    if (voiRangeRef.current) {
      viewport.setProperties({ voiRange: voiRangeRef.current });
    }

    viewport.render();
  }

  async function handleApplySmoothing() {
    const viewport = viewportRef.current;
    const originalPixelData = originalPixelDataRef.current;

    if (!viewport || !originalPixelData) {
      return;
    }

    setProcessing(true);

    try {
      const width = imageWidthRef.current;
      const height = imageHeightRef.current;

      // --------------------------------
      // Apply OpenCV smoothing
      // --------------------------------

      const smoothedPixelData = await applySmoothing(
        originalPixelData,
        width,
        height,
      );

      // --------------------------------
      // Show processed pixels in the viewport
      // --------------------------------

      // createAndCacheLocalImage registers imagePlane/imagePixel metadata
      // for the new imageId and puts the image in the cache, which the
      // StackViewport needs in order to display it.
      const imagePlane = metaData.get("imagePlaneModule", originalImageId);
      const processedImageId = `processed:smoothing-${Date.now()}`;

      imageLoader.createAndCacheLocalImage(processedImageId, {
        scalarData: smoothedPixelData,
        dimensions: [width, height],
        spacing: [
          imagePlane?.columnPixelSpacing ?? 1,
          imagePlane?.rowPixelSpacing ?? 1,
        ],
        origin: imagePlane?.imagePositionPatient,
        direction: imagePlane?.imageOrientationPatient,
        frameOfReferenceUID: imagePlane?.frameOfReferenceUID,
        targetBuffer: { type: "Uint16Array" },
      });

      // StackViewport.buildMetadata destructures generalSeriesModule (modality);
      // createAndCacheLocalImage doesn't register it, so copy it from the original.
      utilities.genericMetadataProvider.add(processedImageId, {
        type: "generalSeriesModule",
        metadata: metaData.get("generalSeriesModule", originalImageId) ?? {
          modality: "OT",
        },
      });

      await showImage(processedImageId);

      // --------------------------------
      // Verify what is actually rendered (VTK scalars) vs original
      // --------------------------------

      const renderedPixels = viewport
        .getDefaultActor()
        ?.actor.getMapper()
        ?.getInputData()
        ?.getPointData()
        .getScalars()
        .getData();

      if (!renderedPixels) {
        console.error("No rendered VTK scalar data found");
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

      console.log("Displayed image:", viewport.getCurrentImageId());
      console.log("Changed pixels:", changedPixels, "/", originalPixelData.length);
      console.log("Max difference:", maxDifference);
    } catch (error) {
      console.error("Smoothing failed:", error);
    } finally {
      setProcessing(false);
    }
  }

  async function handleReset() {
    try {
      await showImage(originalImageId);
    } catch (error) {
      console.error("Reset failed:", error);
    }
  }

  return (
    <div>
      <div className="viewer-toolbar">
        <button
          disabled={!ready || processing}
          onClick={handleApplySmoothing}
        >
          {processing ? "Smoothing…" : "Apply smoothing"}
        </button>
        <button disabled={!ready || processing} onClick={handleReset}>
          Reset
        </button>
      </div>
      <div ref={elementRef} className="cornerstone-viewport" />
    </div>
  );
}
