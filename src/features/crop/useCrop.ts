import { useCallback, useEffect, useState } from "react";
import { applyImageOp } from "../annotate/documentActions";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Owns the crop selection rect and commits it by re-rasterizing the image.
 * Starts at the full image bounds as soon as the crop tool activates ~
 * cropping is "shrink the kept area inward from an edge" rather than
 * "drag out a new region from nothing".
 */
export function useCrop(imageElement: HTMLImageElement | null, active: boolean) {
  const [cropRect, setCropRect] = useState<CropRect | null>(null);

  useEffect(() => {
    if (active && imageElement) {
      setCropRect({ x: 0, y: 0, width: imageElement.width, height: imageElement.height });
    } else {
      setCropRect(null);
    }
  }, [active, imageElement]);

  const commitCrop = useCallback(() => {
    if (!cropRect || !imageElement || cropRect.width < 2 || cropRect.height < 2) {
      setCropRect(null);
      return;
    }
    const op = {
      op: "crop" as const,
      x: Math.round(cropRect.x),
      y: Math.round(cropRect.y),
      width: Math.round(cropRect.width),
      height: Math.round(cropRect.height),
    };
    setCropRect(null);
    applyImageOp(op).catch((err) => console.error("crop failed", err));
  }, [cropRect, imageElement]);

  const cancelCrop = useCallback(() => setCropRect(null), []);

  return { cropRect, setCropRect, commitCrop, cancelCrop };
}
