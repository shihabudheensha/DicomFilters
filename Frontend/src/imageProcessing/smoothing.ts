import { initOpenCV } from "./opencv";

export async function applySmoothing(
  pixelData: Uint16Array,
  width: number,
  height: number,
  // Scale blur with image size so it stays visible when fit to the viewport
  sigma = Math.max(2, Math.round(Math.min(width, height) / 100)),
): Promise<Uint16Array> {
  const cv = await initOpenCV();

  // Create OpenCV Mat from original 16-bit grayscale pixels
  const sourceMat = new cv.Mat(height, width, cv.CV_16UC1);

  sourceMat.data16U.set(pixelData);

  console.log("Source Mat:");
  console.log("Rows:", sourceMat.rows);
  console.log("Cols:", sourceMat.cols);
  console.log("Channels:", sourceMat.channels());

  // Create destination Mat
  const smoothedMat = new cv.Mat();

  // Kernel covers +/- 3 sigma
  const kernelSize = 2 * Math.ceil(3 * sigma) + 1;

  // Apply Gaussian smoothing
  cv.GaussianBlur(
    sourceMat,
    smoothedMat,
    new cv.Size(kernelSize, kernelSize),
    sigma,
    sigma,
    cv.BORDER_DEFAULT,
  );
  console.log("Smoothing applied, sigma:", sigma, "kernel:", kernelSize);

  // Copy processed pixels into a new Uint16Array
  const processedPixelData = new Uint16Array(smoothedMat.data16U);

  console.log("Processed pixel data length:", processedPixelData.length);

  // Clean up OpenCV memory
  sourceMat.delete();
  smoothedMat.delete();

  return processedPixelData;
}
