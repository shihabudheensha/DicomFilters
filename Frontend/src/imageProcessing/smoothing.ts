import { initOpenCV } from "./opencv";

export async function applySmoothing(
  pixelData: Uint16Array,
  width: number,
  height: number
): Promise<Uint16Array> {
  const cv = await initOpenCV();

  // Create OpenCV Mat from original 16-bit grayscale pixels
  const sourceMat = new cv.Mat(
    height,
    width,
    cv.CV_16UC1
  );

  sourceMat.data16U.set(pixelData);

  console.log("Source Mat:");
  console.log("Rows:", sourceMat.rows);
  console.log("Cols:", sourceMat.cols);
  console.log("Channels:", sourceMat.channels());

  // Create destination Mat
  const smoothedMat = new cv.Mat();

  // Apply Gaussian smoothing
  cv.GaussianBlur(
    sourceMat,
    smoothedMat,
    new cv.Size(5, 5),
    0,
    0,
    cv.BORDER_DEFAULT
  );

  console.log("Smoothing applied");

  // Copy processed pixels into a new Uint16Array
  const processedPixelData = new Uint16Array(
    smoothedMat.data16U
  );

  console.log(
    "Processed pixel data length:",
    processedPixelData.length
  );

  // Clean up OpenCV memory
  sourceMat.delete();
  smoothedMat.delete();

  return processedPixelData;
}