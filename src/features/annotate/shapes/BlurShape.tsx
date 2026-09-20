import { useEffect, useRef } from "react";
import { Image as KonvaImage } from "react-konva";
import Konva from "konva";
import { useDocumentStore } from "../../../stores/documentStore";
import { useImage } from "../../../lib/useImage";
import { BlurShape as BlurShapeData } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

/**
 * Renders a cropped copy of the screenshot itself, blurred or pixelated, on
 * top of the real image — redacts whatever's underneath rather than
 * covering it with an opaque shape. Konva filters only apply to a cached
 * bitmap snapshot of the node, so it has to be explicitly re-cached
 * whenever the crop region, effect, or intensity changes.
 */
export function BlurShapeView({ shape, ...common }: ShapeComponentProps<BlurShapeData>) {
  const image = useDocumentStore((s) => s.image);
  const imageElement = useImage(image);
  const nodeRef = useRef<Konva.Image>(null);

  const { blurEffect, blurIntensity } = shape.style;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    node.cache();
    node.getLayer()?.batchDraw();
  }, [imageElement, shape.x, shape.y, shape.width, shape.height, blurEffect, blurIntensity]);

  if (!imageElement) return null;

  return (
    <KonvaImage
      {...common}
      ref={(node) => {
        nodeRef.current = node;
        common.ref?.(node);
      }}
      image={imageElement}
      x={shape.x}
      y={shape.y}
      width={Math.max(1, shape.width)}
      height={Math.max(1, shape.height)}
      rotation={shape.rotation}
      crop={{ x: shape.x, y: shape.y, width: Math.max(1, shape.width), height: Math.max(1, shape.height) }}
      filters={[blurEffect === "blur" ? Konva.Filters.Blur : Konva.Filters.Pixelate]}
      blurRadius={blurEffect === "blur" ? blurIntensity : undefined}
      pixelSize={blurEffect === "pixelate" ? blurIntensity : undefined}
      onDragMove={(e) => {
        // `crop` is a React-controlled prop bound to shape.x/y, so it only
        // reflects the *committed* position — Konva moves the node's actual
        // x/y live during the drag without touching that. Left alone, the
        // patch drags around still showing whatever was blurred at its
        // original spot, only re-sampling the real content once the drag
        // ends. Re-cropping and re-caching from the node's own live position
        // on every move keeps it redacting whatever's actually underneath.
        const node = e.target as Konva.Image;
        const w = Math.max(1, shape.width);
        const h = Math.max(1, shape.height);
        node.crop({ x: node.x(), y: node.y(), width: w, height: h });
        node.cache();
        node.getLayer()?.batchDraw();
      }}
      onTransform={(e) => {
        // Same problem as dragging, but for resize: Konva's default is to
        // apply a live scaleX/scaleY to the node, which just stretches the
        // already-cached blurred bitmap — the redaction visibly distorts
        // instead of revealing more/less of the source. Baking the scale
        // into width/height and re-cropping/re-caching from those on every
        // tick makes it actually resample a bigger or smaller region, same
        // as the earlier fix for resizing text.
        const node = e.target as Konva.Image;
        const width = Math.max(1, node.width() * node.scaleX());
        const height = Math.max(1, node.height() * node.scaleY());
        node.width(width);
        node.height(height);
        node.scaleX(1);
        node.scaleY(1);
        node.crop({ x: node.x(), y: node.y(), width, height });
        node.cache();
        node.getLayer()?.batchDraw();
      }}
    />
  );
}
