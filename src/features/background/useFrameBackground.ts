import { useEffect, useMemo, useState } from "react";
import { tauriApi } from "../../lib/tauriApi";
import { Box, Frame } from "./frame";
import { gradientCanvas } from "./gradients";

/** What Canvas draws behind the screenshot: a flat colour, or an image
 * source cropped to fill the frame. */
export type ResolvedBackground =
  | { kind: "color"; color: string }
  | { kind: "image"; source: CanvasImageSource; crop?: Box };

/** The part of a `width`x`height` source that fills a box of `aspect`
 * without stretching it, centred ~ CSS `object-fit: cover`. */
export function coverCrop(width: number, height: number, aspect: number): Box {
  if (width / height > aspect) {
    const w = height * aspect;
    return { x: (width - w) / 2, y: 0, width: w, height };
  }
  const h = width / aspect;
  return { x: 0, y: (height - h) / 2, width, height: h };
}

const blurredCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

/**
 * The screenshot, small and heavily blurred. Blurring a small copy is both
 * far cheaper than blurring the full capture and looks the same once it's
 * stretched back up, since there's no detail left to lose.
 */
export function blurredCopy(image: HTMLImageElement): HTMLCanvasElement {
  let canvas = blurredCache.get(image);
  if (canvas) return canvas;
  const width = 480;
  const height = Math.max(1, Math.round((image.height / image.width) * width));
  canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "blur(22px) saturate(1.3)";
  // Drawn oversized so the blur's soft, see-through edge falls outside the
  // canvas instead of showing as a pale rim around the frame.
  const grow = 0.25;
  ctx.drawImage(image, -width * grow, -height * grow, width * (1 + grow * 2), height * (1 + grow * 2));
  blurredCache.set(image, canvas);
  return canvas;
}

const loaded = new Map<string, Promise<HTMLImageElement>>();

/** Loads the wallpaper or a picked image once per session and path. A blob
 * URL, not a file URL, keeps the export canvas same-origin and untainted. */
export function loadBackgroundImage(background: Frame["background"]): Promise<HTMLImageElement> | null {
  const key = background.kind === "wallpaper" ? "wallpaper" : background.kind === "image" ? `image:${background.path}` : null;
  if (!key) return null;
  let promise = loaded.get(key);
  if (!promise) {
    const bytes =
      background.kind === "wallpaper"
        ? tauriApi.desktopWallpaper()
        : tauriApi.readBackgroundImage((background as { path: string }).path);
    promise = bytes.then(
      (buffer) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("background image failed to decode"));
          img.src = URL.createObjectURL(new Blob([buffer]));
        }),
    );
    // A failure is not cached: the file may exist next time.
    promise.catch(() => loaded.delete(key));
    loaded.set(key, promise);
  }
  return promise;
}

/** Resolves the frame's background into something drawable. */
export function useFrameBackground(
  frame: Frame | null,
  image: HTMLImageElement | null,
  bounds: Box | null,
): ResolvedBackground | null {
  const [picture, setPicture] = useState<HTMLImageElement | null>(null);
  const background = frame?.background;
  const pictureKey =
    background?.kind === "wallpaper" ? "wallpaper" : background?.kind === "image" ? background.path : null;

  useEffect(() => {
    setPicture(null);
    if (!background) return;
    const promise = loadBackgroundImage(background);
    if (!promise) return;
    let cancelled = false;
    promise.then(
      (img) => !cancelled && setPicture(img),
      (err) => console.error("could not load background image", err),
    );
    return () => {
      cancelled = true;
    };
    // Keyed on what to load, not on the background object's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pictureKey]);

  const aspect = bounds ? bounds.width / bounds.height : 1;

  return useMemo((): ResolvedBackground | null => {
    if (!background || !image) return null;
    switch (background.kind) {
      case "color":
        return { kind: "color", color: background.color };
      case "gradient": {
        const canvas = gradientCanvas(background.id, aspect);
        return canvas ? { kind: "image", source: canvas } : null;
      }
      case "blurred": {
        const canvas = blurredCopy(image);
        return { kind: "image", source: canvas, crop: coverCrop(canvas.width, canvas.height, aspect) };
      }
      case "wallpaper":
      case "image":
        return picture
          ? { kind: "image", source: picture, crop: coverCrop(picture.naturalWidth, picture.naturalHeight, aspect) }
          : null;
    }
  }, [background, image, aspect, picture]);
}
