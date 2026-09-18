import { Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from "react-konva";
import Konva from "konva";
import { KonvaEventObject } from "konva/lib/Node";

import { useDocumentStore } from "../../stores/documentStore";
import { useToolStore } from "../../stores/toolStore";
import { useImage } from "../../lib/useImage";
import { useZoom } from "../zoom/useZoom";
import { useCrop } from "../crop/useCrop";
import { sampleColorFromImage } from "../color-picker/sampleColor";
import { ShapeRenderer } from "./shapes/ShapeRenderer";
import { createShapeId, Shape } from "./types";
import { getTransformPatch } from "./transform";
import { TextEditorOverlay } from "./TextEditorOverlay";
import "./Canvas.css";

const DRAWABLE_TOOLS = new Set(["rectangle", "ellipse", "line", "arrow", "pen"]);

export interface CanvasHandle {
  exportDataUrl: () => string | null;
}

interface CanvasProps {
  ref?: Ref<CanvasHandle>;
}

export function Canvas({ ref }: CanvasProps) {
  const image = useDocumentStore((s) => s.image);
  const shapes = useDocumentStore((s) => s.shapes);
  const selectedShapeId = useDocumentStore((s) => s.selectedShapeId);
  const selectShape = useDocumentStore((s) => s.selectShape);
  const addShape = useDocumentStore((s) => s.addShape);
  const updateShape = useDocumentStore((s) => s.updateShape);
  const commit = useDocumentStore((s) => s.commit);

  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);
  const style = useToolStore((s) => s.style);
  const updateStyle = useToolStore((s) => s.updateStyle);

  const imageElement = useImage(image);
  const { view, onWheel, setView } = useZoom();
  const { cropRect, setCropRect, commitCrop, cancelCrop } = useCrop(imageElement);

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  // Starts null (rather than a guessed placeholder) so the very first "fit to
  // window" calculation always uses a real, measured container size — an
  // early guess here would produce a wrong scale that a later resize would
  // only recenter, never correct, permanently skewing shape coordinates.
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);

  const drawing = useRef<{ shape: Shape } | null>(null);
  const [liveShape, setLiveShape] = useState<Shape | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const previousImageRef = useRef<HTMLImageElement | null>(null);

  useImperativeHandle(ref, () => ({
    exportDataUrl: () => {
      const stage = stageRef.current;
      if (!stage || !imageElement) return null;
      const priorSelection = selectedShapeId;
      selectShape(null);
      transformerRef.current?.nodes([]);
      const dataUrl = stage.toDataURL({
        x: view.x,
        y: view.y,
        width: imageElement.width * view.scale,
        height: imageElement.height * view.scale,
        pixelRatio: 1 / view.scale,
      });
      if (priorSelection) selectShape(priorSelection);
      return dataUrl;
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      setStageSize((prev) => {
        // ResizeObserver fires on plenty of noise that isn't a real resize
        // (sub-pixel layout jitter, DPI/monitor changes while dragging,
        // etc.). Recentering the view on every tick made the image visibly
        // shift out from under an in-progress shape drag, so only actually
        // update — and trigger the recenter effect below — on a real change.
        if (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) {
          return prev;
        }
        return { width, height };
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!imageElement || !stageSize) return;
    const isNewImage = previousImageRef.current !== imageElement;
    previousImageRef.current = imageElement;

    if (isNewImage) {
      const fitScale = Math.min(
        (stageSize.width - 40) / imageElement.width,
        (stageSize.height - 40) / imageElement.height,
        1,
      );
      setView({
        scale: fitScale,
        x: (stageSize.width - imageElement.width * fitScale) / 2,
        y: (stageSize.height - imageElement.height * fitScale) / 2,
      });
    } else {
      // Same image, just a window resize (or ResizeObserver re-fire): keep the
      // current zoom level, but re-center it in the new viewport.
      setView((prev) => ({
        scale: prev.scale,
        x: (stageSize.width - imageElement.width * prev.scale) / 2,
        y: (stageSize.height - imageElement.height * prev.scale) / 2,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageElement, stageSize]);

  useEffect(() => {
    const isTypingTarget = () => {
      const el = document.activeElement;
      return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTypingTarget()) {
        e.preventDefault();
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpacePressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedShapeId ? nodeRefs.current.get(selectedShapeId) : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedShapeId, shapes]);

  const toImagePoint = useCallback(
    (stage: Konva.Stage) => {
      const pointer = stage.getPointerPosition();
      if (!pointer) return null;
      return { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    },
    [view],
  );

  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (spacePressed) return;
      const stage = stageRef.current;
      if (!stage) return;
      const point = toImagePoint(stage);
      if (!point) return;

      if (activeTool === "select") {
        if (e.target === stage) selectShape(null);
        return;
      }

      if (activeTool === "eyedropper") {
        if (!imageElement) return;
        const hex = sampleColorFromImage(imageElement, point.x, point.y);
        if (hex) updateStyle({ stroke: hex, fillColor: hex });
        setActiveTool("select");
        return;
      }

      if (activeTool === "crop") {
        setCropRect({ x: point.x, y: point.y, width: 0, height: 0 });
        return;
      }

      if (!DRAWABLE_TOOLS.has(activeTool)) return;

      const base = { id: createShapeId(), x: point.x, y: point.y, rotation: 0, style };
      let shape: Shape;
      switch (activeTool) {
        case "rectangle":
          shape = { ...base, type: "rectangle", width: 1, height: 1 };
          break;
        case "ellipse":
          shape = { ...base, type: "ellipse", radiusX: 1, radiusY: 1 };
          break;
        case "line":
          shape = { ...base, type: "line", points: [0, 0, 0, 0] };
          break;
        case "arrow":
          shape = { ...base, type: "arrow", points: [0, 0, 0, 0] };
          break;
        case "pen":
          shape = { ...base, type: "freehand", points: [0, 0] };
          break;
        default:
          return;
      }
      drawing.current = { shape };
      setLiveShape(shape);
    },
    [spacePressed, activeTool, toImagePoint, selectShape, imageElement, setActiveTool, updateStyle, setCropRect, style],
  );

  const handleMouseMove = useCallback(() => {
    if (spacePressed) return;
    const stage = stageRef.current;
    if (!stage) return;
    const point = toImagePoint(stage);
    if (!point) return;

    if (cropRect && activeTool === "crop") {
      setCropRect((r) => (r ? { ...r, width: point.x - r.x, height: point.y - r.y } : r));
      return;
    }

    if (!drawing.current) return;
    const { shape } = drawing.current;
    const dx = point.x - shape.x;
    const dy = point.y - shape.y;

    let updated: Shape = shape;
    if (shape.type === "rectangle") updated = { ...shape, width: dx, height: dy };
    else if (shape.type === "ellipse") updated = { ...shape, radiusX: Math.abs(dx), radiusY: Math.abs(dy) };
    else if (shape.type === "line" || shape.type === "arrow") updated = { ...shape, points: [0, 0, dx, dy] };
    else if (shape.type === "freehand") updated = { ...shape, points: [...shape.points, dx, dy] };

    drawing.current = { shape: updated };
    setLiveShape(updated);
  }, [spacePressed, activeTool, cropRect, setCropRect, toImagePoint]);

  const handleMouseUp = useCallback(() => {
    if (spacePressed) return;
    if (activeTool === "crop") return; // crop is confirmed explicitly, not on mouse up

    if (drawing.current) {
      const finished = normalizeShape(drawing.current.shape);
      drawing.current = null;
      setLiveShape(null);
      addShape(finished);
      if (finished.type !== "freehand") setActiveTool("select");
    }
  }, [spacePressed, activeTool, addShape, setActiveTool]);

  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (spacePressed) return;
      if (activeTool !== "text") return;
      const stage = stageRef.current;
      if (!stage || e.target !== stage) return;
      const point = toImagePoint(stage);
      if (!point) return;

      const shape: Shape = {
        id: createShapeId(),
        type: "text",
        x: point.x,
        y: point.y,
        rotation: 0,
        width: 220,
        text: "Text",
        style,
      };
      addShape(shape);
      setEditingTextId(shape.id);
      setActiveTool("select");
    },
    [spacePressed, activeTool, toImagePoint, addShape, setActiveTool, style],
  );

  const handleStageDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      setView((prev) => ({ ...prev, x: e.target.x(), y: e.target.y() }));
    },
    [setView],
  );

  const registerShapeRef = useCallback((id: string) => (node: Konva.Node | null) => {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }, []);

  const editingShape = editingTextId ? shapes.find((s) => s.id === editingTextId) : null;

  return (
    <div className="canvas" ref={containerRef}>
      {stageSize && (
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable={spacePressed}
        onDragMove={handleStageDragMove}
        onWheel={onWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleStageClick}
        style={{ cursor: spacePressed ? "grab" : activeTool === "select" ? "default" : "crosshair" }}
      >
        <Layer>
          {imageElement && (
            <KonvaImage
              image={imageElement}
              listening={false}
              shadowColor="black"
              shadowBlur={24}
              shadowOpacity={0.25}
              shadowOffsetY={6}
            />
          )}

          {shapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              draggable={activeTool === "select"}
              ref={registerShapeRef(shape.id)}
              onClick={() => activeTool === "select" && selectShape(shape.id)}
              onTap={() => activeTool === "select" && selectShape(shape.id)}
              onDblClick={() => shape.type === "text" && setEditingTextId(shape.id)}
              onDragStart={commit}
              onDragEnd={(e) => updateShape(shape.id, { x: e.target.x(), y: e.target.y() })}
              onTransformEnd={(e) => {
                const node = e.target as Konva.Node;
                commit();
                updateShape(shape.id, getTransformPatch(shape, node));
              }}
            />
          ))}

          {liveShape && <ShapeRenderer shape={liveShape} draggable={false} onClick={() => {}} onTap={() => {}} onDragEnd={() => {}} onTransformEnd={() => {}} />}

          {activeTool === "select" && (
            <Transformer ref={transformerRef} rotateEnabled anchorSize={9} borderStroke="#3d7bfd" anchorStroke="#3d7bfd" />
          )}

          {cropRect && (
            <Rect
              x={Math.min(cropRect.x, cropRect.x + cropRect.width)}
              y={Math.min(cropRect.y, cropRect.y + cropRect.height)}
              width={Math.abs(cropRect.width)}
              height={Math.abs(cropRect.height)}
              stroke="#ffffff"
              dash={[6, 4]}
              strokeWidth={1.5 / view.scale}
              fill="rgba(61,123,253,0.15)"
            />
          )}
        </Layer>
      </Stage>
      )}

      {editingShape && editingShape.type === "text" && (
        <TextEditorOverlay
          shape={editingShape}
          view={view}
          onCommit={(text) => {
            updateShape(editingShape.id, { text });
            setEditingTextId(null);
          }}
          onCancel={() => setEditingTextId(null)}
        />
      )}

      {cropRect && (
        <div className="canvas__crop-actions">
          <button type="button" onClick={commitCrop}>
            Apply crop
          </button>
          <button type="button" onClick={cancelCrop}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function normalizeShape(shape: Shape): Shape {
  if (shape.type === "rectangle") {
    const x = Math.min(shape.x, shape.x + shape.width);
    const y = Math.min(shape.y, shape.y + shape.height);
    return { ...shape, x, y, width: Math.abs(shape.width), height: Math.abs(shape.height) };
  }
  return shape;
}
