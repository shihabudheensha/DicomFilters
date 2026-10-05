import { init as coreInit } from "@cornerstonejs/core";
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader";

let initialized = false;

export async function initCornerstone() {
  if (initialized) {
    return;
  }

  await coreInit();

  await dicomImageLoaderInit({
    maxWebWorkers: navigator.hardwareConcurrency || 1,
  });

  //console.log("Cornerstone initialized");

  initialized = true;
}