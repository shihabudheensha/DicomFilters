import { useEffect, useRef } from "react";
import { RenderingEngine, Enums, type Types } from "@cornerstonejs/core";

import { initCornerstone } from "../cornerstone/initCornerstone";
import { initOpenCV } from "../imageProcessing/opencv";
import { applySmoothing } from "../imageProcessing/smoothing";
import { getMinMax } from "../imageProcessing/pixelUtils";

const { ViewportType } = Enums;

const renderingEngineId = "tigerview9RenderingEngine";
const viewportId = "tigerview9Viewport";

const dicomUrl = "https://localhost:7099/api/dicom/instance-0005.dcm";

export default function DicomViewer() {
  const elementRef = useRef<HTMLDivElement>(null);
  const originalPixelDataRef = useRef<Uint16Array | null>(null);
  const imageWidthRef = useRef<number>(0);
  const imageHeightRef = useRef<number>(0);

  useEffect(() => {
    let renderingEngine: RenderingEngine | undefined;

    async function loadDicom() {
      if (!elementRef.current) {
        return;
      }

      try {
        //console.log("Initializing Cornerstone...");

        await initCornerstone();

        //console.log("Cornerstone initialized");

        const cv = await initOpenCV();
        console.log("OpenCV ready");

        renderingEngine = new RenderingEngine(renderingEngineId);

        const viewportInput: Types.PublicViewportInput = {
          viewportId,
          element: elementRef.current,
          type: ViewportType.STACK,
        };

        renderingEngine.enableElement(viewportInput);

        //console.log("Viewport enabled");

        const viewport = renderingEngine.getViewport(
          viewportId,
        ) as Types.IStackViewport;

        const imageId = `wadouri:${dicomUrl}`;

        //console.log("Loading image:", imageId);

        await viewport.setStack([imageId], 0);

        //console.log("Stack loaded");

        const originalImage = viewport.getCornerstoneImage();

        console.log("Original Cornerstone image:", originalImage);

        const imageData = viewport.getImageData();

        //console.log("Image data:", imageData);

        if (!imageData) {
          throw new Error("No image data");
        }

        const width = imageData.dimensions[0];
        const height = imageData.dimensions[1];

        console.log("Width:", width);
        console.log("Height:", height);

        console.log("Scalar data type:", imageData.scalarData.constructor.name);

        console.log("Scalar data length:", imageData.scalarData.length);

        if (!(imageData.scalarData instanceof Uint16Array)) {
          throw new Error(
            `Expected Uint16Array but got ${imageData.scalarData.constructor.name}`,
          );
        }

        const pixelData = imageData.scalarData;

        // --------------------------------
        // Keep ORIGINAL pixels
        // --------------------------------

        const originalPixelData = new Uint16Array(pixelData);

        originalPixelDataRef.current = originalPixelData;

        imageWidthRef.current = width;
        imageHeightRef.current = height;

        console.log("Original pixel data stored:", originalPixelData.length);

        // --------------------------------
        // Apply OpenCV smoothing
        // --------------------------------

        const smoothedPixelData = await applySmoothing(
          originalPixelData,
          width,
          height,
        );

        console.log("Smoothed pixel data:", smoothedPixelData);

        console.log("Smoothed pixel data length:", smoothedPixelData.length);

        // --------------------------------
        // Compare pixels
        // --------------------------------

        console.log(
          "Original first 10 pixels:",
          Array.from(originalPixelData.slice(0, 10)),
        );

        console.log(
          "Smoothed first 10 pixels:",
          Array.from(smoothedPixelData.slice(0, 10)),
        );

        const { min, max } = getMinMax(smoothedPixelData);

        console.log("Processed min:", min);

        console.log("Processed max:", max);

        

        viewport.resetCamera();
        viewport.render();

        //console.log("Image rendered");
      } catch (error) {
        console.error("DICOM loading failed:", error);
      }
    }

    loadDicom();

    return () => {
      renderingEngine?.disableElement(viewportId);
    };
  }, []);

  return <div ref={elementRef} className="cornerstone-viewport" />;
}
