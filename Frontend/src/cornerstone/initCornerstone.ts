import { init as coreInit } from "@cornerstonejs/core";
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader";

let initializationPromise: Promise<void> | null = null;

export function initCornerstone(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = initialize();
  }

  return initializationPromise;
}

async function initialize() {
  await coreInit();

  await dicomImageLoaderInit({
    maxWebWorkers:
      navigator.hardwareConcurrency || 1,
  });

  console.log("Cornerstone initialized");
}