import { CropRect } from "./useCrop";

/** Ratios offered in the crop bar: width over height. "free" is the whole picture. */
export const CROP_RATIOS = [
  { id: "free", label: null, ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
] as const;

/**
 * The largest rectangle of the given shape that fits inside the picture,
 * centred. A starting point to adjust from, not a lock: the crop handles
 * still move freely afterwards.
 */
export function largestCentredRect(imageWidth: number, imageHeight: number, ratio: number | null): CropRect {
  if (ratio === null) return { x: 0, y: 0, width: imageWidth, height: imageHeight };
  let width = imageWidth;
  let height = width / ratio;
  if (height > imageHeight) {
    height = imageHeight;
    width = height * ratio;
  }
  width = Math.round(width);
  height = Math.round(height);
  return {
    x: Math.round((imageWidth - width) / 2),
    y: Math.round((imageHeight - height) / 2),
    width,
    height,
  };
}
