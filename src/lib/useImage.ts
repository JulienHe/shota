import { useEffect, useState } from "react";

// Keyed by data-URL source. The background screenshot and every blur/
// pixelate region (each a separate Konva.Image reading the same source)
// used to independently `new Image()` + reload the full capture from its
// data URL — for a multi-MB 4K screenshot, redundant decode work for every
// extra shape. The background image is always the first thing loaded after
// a capture, so by the time any shape needs the same source, this is
// already warm.
const imageCache = new Map<string, HTMLImageElement>();
const MAX_CACHED_IMAGES = 3;

function cacheImage(src: string, img: HTMLImageElement) {
  imageCache.set(src, img);
  // Each capture can be several MB decoded — without a cap, a long session
  // with many captures would hold every past screenshot in memory forever.
  while (imageCache.size > MAX_CACHED_IMAGES) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
}

/**
 * Seeds the cache with an already-decoded image so a later `useImage(src)`
 * call (e.g. Canvas's background image) hits it synchronously instead of
 * decoding the same multi-MB data URL a second time. EditorWindow already
 * has to decode the capture once itself (to read width/height before it
 * can even call `loadImage`) — without this, that decoded image was
 * discarded and Canvas would redundantly decode the exact same bytes
 * again, which is what made the toolbar visibly render before the image did.
 */
export function primeImageCache(src: string, img: HTMLImageElement) {
  cacheImage(src, img);
}

/** Loads a data-URL image into an HTMLImageElement for use as a Konva.Image source. */
export function useImage(src: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(src ? imageCache.get(src) ?? null : null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const cached = imageCache.get(src);
    if (cached) {
      setImage(cached);
      return;
    }
    const img = new Image();
    img.onload = () => {
      cacheImage(src, img);
      setImage(img);
    };
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);

  return image;
}
