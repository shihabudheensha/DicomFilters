import cvModule from "@techstark/opencv-js";

let initializationPromise: Promise<typeof cvModule> | null = null;

export function initOpenCV() {
  if (!initializationPromise) {
    initializationPromise = getOpenCV();
  }

  return initializationPromise;
}

async function getOpenCV() {
  let cv;

  if (cvModule instanceof Promise) {
    cv = await cvModule;
  } else {
    if (cvModule.Mat) {
      cv = cvModule;
    } else {
      await new Promise<void>((resolve) => {
        cvModule.onRuntimeInitialized = () => resolve();
      });

      cv = cvModule;
    }
  }

  console.log("OpenCV.js initialized");

  return cv;
}