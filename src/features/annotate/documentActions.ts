import { useDocumentStore } from "../../stores/documentStore";
import { dimensionsAfter, ImageOp, renderOps, transformShapes } from "./imageOps";

/** Loads a picture from a URL into an element, waiting for it to decode. */
export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not decode the image"));
    image.src = url;
  });
}

function toBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else reject(new Error("could not encode the image"));
    }, "image/png");
  });
}

/**
 * Applies an edit to the picture itself (crop, rotate, flip): re-draws it,
 * moves the shapes with it, and records the edit so it can be replayed on the
 * original when the capture is reopened.
 */
export async function applyImageOp(op: ImageOp): Promise<void> {
  const state = useDocumentStore.getState();
  if (!state.image) return;

  const before = { width: state.imageWidth, height: state.imageHeight };
  const source = await loadImageElement(state.image);
  const url = await toBlobUrl(renderOps(source, [op]));
  const after = dimensionsAfter(op, before);

  const previous = state.image;
  useDocumentStore
    .getState()
    .replaceImage(url, after.width, after.height, transformShapes(state.shapes, op, before), undefined, [
      ...state.imageOps,
      op,
    ]);
  // Only ever a URL made here or by the editor for this document; nothing
  // else reads the old picture now that the new one is in place.
  if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
}

/**
 * The picture a saved document was left showing: the original with its edits
 * replayed. Returns the original untouched when there were none.
 */
export async function replaySavedOps(
  original: HTMLImageElement,
  originalUrl: string,
  ops: ImageOp[],
): Promise<{ url: string; element: HTMLImageElement }> {
  if (ops.length === 0) return { url: originalUrl, element: original };
  const url = await toBlobUrl(renderOps(original, ops));
  const element = await loadImageElement(url);
  URL.revokeObjectURL(originalUrl);
  return { url, element };
}
