let sampleCanvas: HTMLCanvasElement | null = null;

function toHex(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

/** Reads the pixel color at (x, y) in the given image's natural coordinate space. */
export function sampleColorFromImage(image: HTMLImageElement, x: number, y: number): string | null {
  if (!sampleCanvas) sampleCanvas = document.createElement("canvas");
  const canvas = sampleCanvas;

  if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(image, 0, 0);
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;

  const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
