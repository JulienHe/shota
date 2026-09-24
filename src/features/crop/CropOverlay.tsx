import { useEffect, useRef } from "react";
import { Rect, Line, Transformer } from "react-konva";
import Konva from "konva";
import { ZoomState } from "../zoom/useZoom";
import { imageToAbsolute, imageLengthToAbsolute, absoluteLengthToImage } from "../zoom/viewTransform";
import { bakeNodeScale } from "../annotate/transform";
import { CropRect } from "./useCrop";

interface CropOverlayProps {
  imageElement: HTMLImageElement;
  cropRect: CropRect;
  view: ZoomState;
  onChange: (rect: CropRect) => void;
}

const MIN_CROP_SIZE = 20;

/**
 * Full-image crop editor: starts wrapping the whole image so cropping is
 * "shrink the kept area inward from an edge or corner" rather than "drag out
 * a brand-new rectangle". The area outside the current crop is dimmed, and a
 * rule-of-thirds grid overlays the kept area for composition.
 */
export function CropOverlay({ imageElement, cropRect, view, onChange }: CropOverlayProps) {
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (rectRef.current && trRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, []);

  const imgW = imageElement.width;
  const imgH = imageElement.height;
  const { x, y, width, height } = cropRect;

  // Konva's Transformer boundBoxFunc works in absolute (stage-scaled)
  // coordinates, not the image-local pixel space the rest of the app's
  // shapes live in — the image's own bounds have to be converted into that
  // same space to clamp a resize against them.
  const boundBoxFunc = (oldBox: Konva.Box, newBox: Konva.Box): Konva.Box => {
    const { x: minX, y: minY } = imageToAbsolute(view, { x: 0, y: 0 });
    const { x: maxX, y: maxY } = imageToAbsolute(view, { x: imgW, y: imgH });
    const minSize = imageLengthToAbsolute(view, MIN_CROP_SIZE);

    let { x: nx, y: ny, width: nw, height: nh } = newBox;
    if (nx < minX) {
      nw -= minX - nx;
      nx = minX;
    }
    if (ny < minY) {
      nh -= minY - ny;
      ny = minY;
    }
    if (nx + nw > maxX) nw = maxX - nx;
    if (ny + nh > maxY) nh = maxY - ny;
    if (nw < minSize || nh < minSize) return oldBox;
    return { ...newBox, x: nx, y: ny, width: nw, height: nh };
  };

  // Live-drag/resize handler: reads the node's own current geometry rather
  // than trusting scaleX/scaleY math against possibly-stale React state, the
  // same "bake scale into size, reset to 1" pattern used for text/blur
  // shapes elsewhere in the canvas.
  const commitFromNode = () => {
    const node = rectRef.current;
    if (!node) return;
    const { width: nextWidth, height: nextHeight } = bakeNodeScale(node, MIN_CROP_SIZE);
    onChange({ x: node.x(), y: node.y(), width: nextWidth, height: nextHeight });
  };

  const dragBoundFunc = (pos: { x: number; y: number }) => {
    const w = imageLengthToAbsolute(view, width);
    const h = imageLengthToAbsolute(view, height);
    const { x: minX, y: minY } = imageToAbsolute(view, { x: 0, y: 0 });
    const { x: maxXFull, y: maxYFull } = imageToAbsolute(view, { x: imgW, y: imgH });
    const maxX = maxXFull - w;
    const maxY = maxYFull - h;
    return {
      x: Math.min(Math.max(pos.x, minX), Math.max(minX, maxX)),
      y: Math.min(Math.max(pos.y, minY), Math.max(minY, maxY)),
    };
  };

  // Corner handles are small squares; edge handles are elongated pills
  // (wide-and-short on the top/bottom edges, tall-and-narrow on the
  // left/right ones) — Konva draws every anchor identically by default, so
  // this reshapes each one by its anchor name. Anchors are positioned by
  // their center via offsetX/offsetY, which has to move in lockstep with
  // width/height or the handle drifts off its actual drag point.
  const handleAnchorStyle = (anchor: Konva.Rect) => {
    const name = anchor.name();
    const isHorizontalEdge = name === "top-center" || name === "bottom-center";
    const isVerticalEdge = name === "middle-left" || name === "middle-right";

    let w = 12;
    let h = 12;
    let cornerRadius = 3;
    if (isHorizontalEdge) {
      w = 22;
      h = 8;
      cornerRadius = 4;
    } else if (isVerticalEdge) {
      w = 8;
      h = 22;
      cornerRadius = 4;
    }

    anchor.setAttrs({
      width: w,
      height: h,
      offsetX: w / 2,
      offsetY: h / 2,
      cornerRadius,
      shadowColor: "black",
      shadowBlur: 4,
      shadowOpacity: 0.25,
      shadowOffsetY: 1,
    });
  };

  const handleDragMove = () => {
    const node = rectRef.current;
    if (!node) return;
    onChange({ x: node.x(), y: node.y(), width, height });
  };

  const gridStroke = "rgba(255,255,255,0.55)";
  const gridWidth = absoluteLengthToImage(view, 1);

  return (
    <>
      <Rect x={0} y={0} width={imgW} height={y} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={0} y={y + height} width={imgW} height={imgH - (y + height)} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={0} y={y} width={x} height={height} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={x + width} y={y} width={imgW - (x + width)} height={height} fill="rgba(0,0,0,0.55)" listening={false} />

      <Line points={[x + width / 3, y, x + width / 3, y + height]} stroke={gridStroke} strokeWidth={gridWidth} listening={false} />
      <Line
        points={[x + (2 * width) / 3, y, x + (2 * width) / 3, y + height]}
        stroke={gridStroke}
        strokeWidth={gridWidth}
        listening={false}
      />
      <Line points={[x, y + height / 3, x + width, y + height / 3]} stroke={gridStroke} strokeWidth={gridWidth} listening={false} />
      <Line
        points={[x, y + (2 * height) / 3, x + width, y + (2 * height) / 3]}
        stroke={gridStroke}
        strokeWidth={gridWidth}
        listening={false}
      />

      <Rect
        ref={rectRef}
        x={x}
        y={y}
        width={width}
        height={height}
        stroke="#ffffff"
        strokeWidth={absoluteLengthToImage(view, 2)}
        draggable
        dragBoundFunc={dragBoundFunc}
        onDragMove={handleDragMove}
        onDragEnd={handleDragMove}
        onTransform={commitFromNode}
        onTransformEnd={commitFromNode}
      />
      <Transformer
        ref={trRef}
        keepRatio={false}
        boundBoxFunc={boundBoxFunc}
        rotateEnabled={false}
        anchorStyleFunc={handleAnchorStyle}
        anchorFill="#ffffff"
        anchorStroke="transparent"
        borderStroke="#ffffff"
        borderStrokeWidth={2}
      />
    </>
  );
}
