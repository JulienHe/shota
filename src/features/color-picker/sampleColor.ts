let sampleCanvas: HTMLCanvasElement | null = null;
let sampleCanvasSource: HTMLImageElement | null = null;

function toHex(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

/**
 * A full-resolution copy of the current image, redrawn only when the image
 * itself changes (not just when its dimensions happen to match — two
 * different captures can be the same size). Shared by color sampling and
 * the eyedropper's magnifier preview so both read from the same canvas
 * instead of each keeping their own copy.
 */
export function getSampleCanvas(image: HTMLImageElement): HTMLCanvasElement {
  if (!sampleCanvas) sampleCanvas = document.createElement("canvas");
  if (sampleCanvasSource !== image) {
    sampleCanvasSource = image;
    sampleCanvas.width = image.naturalWidth;
    sampleCanvas.height = image.naturalHeight;
    const ctx = sampleCanvas.getContext("2d");
    ctx?.drawImage(image, 0, 0);
  }
  return sampleCanvas;
}

/** Reads the pixel color at (x, y) in the given image's natural coordinate space. */
export function sampleColorFromImage(image: HTMLImageElement, x: number, y: number): string | null {
  const canvas = getSampleCanvas(image);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;

  const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
