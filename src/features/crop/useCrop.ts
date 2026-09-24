import { useCallback, useEffect, useState } from "react";
import { Shape } from "../annotate/types";
import { useDocumentStore } from "../../stores/documentStore";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Owns the crop selection rect and commits it by re-rasterizing the image.
 * Starts at the full image bounds as soon as the crop tool activates —
 * cropping is "shrink the kept area inward from an edge" rather than
 * "drag out a new region from nothing".
 */
export function useCrop(imageElement: HTMLImageElement | null, active: boolean) {
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const replaceImage = useDocumentStore((s) => s.replaceImage);
  const shapes = useDocumentStore((s) => s.shapes);

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

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropRect.width);
    canvas.height = Math.round(cropRect.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      imageElement,
      cropRect.x,
      cropRect.y,
      cropRect.width,
      cropRect.height,
      0,
      0,
      cropRect.width,
      cropRect.height,
    );

    const shiftedShapes: Shape[] = shapes
      .map((shape) => ({ ...shape, x: shape.x - cropRect.x, y: shape.y - cropRect.y }))
      .filter((shape) => shape.x > -5000 && shape.y > -5000);

    replaceImage(canvas.toDataURL("image/png"), canvas.width, canvas.height, shiftedShapes);
    setCropRect(null);
  }, [cropRect, imageElement, shapes, replaceImage]);

  const cancelCrop = useCallback(() => setCropRect(null), []);

  return { cropRect, setCropRect, commitCrop, cancelCrop };
}
