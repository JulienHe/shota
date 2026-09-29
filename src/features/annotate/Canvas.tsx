import { Ref, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Transformer } from "react-konva";
import Konva from "konva";
import { KonvaEventObject } from "konva/lib/Node";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { useDocumentStore } from "../../stores/documentStore";
import { useToolStore } from "../../stores/toolStore";
import { CanvasBackground, useUiStore } from "../../stores/uiStore";
import { useToastStore } from "../../stores/toastStore";
import { useImage } from "../../lib/useImage";
import { useZoom } from "../zoom/useZoom";
import { absoluteToImage, centeredView } from "../zoom/viewTransform";
import { useCrop } from "../crop/useCrop";
import { CropOverlay } from "../crop/CropOverlay";
import { sampleColorFromImage } from "../color-picker/sampleColor";
import { EyedropperHud } from "../color-picker/EyedropperHud";
import { ShapeRenderer } from "./shapes/ShapeRenderer";
import { createShapeId, isRectLike, isSegment, isStrokeLike, radiusForFontSize, Shape, supportsRotation } from "./types";
import { getTransformPatch, bakeNodeScaleX } from "./transform";
import { TextEditorOverlay } from "./TextEditorOverlay";
import { CanvasBackgroundMenu } from "./CanvasBackgroundMenu";
import { MOVE_CURSOR, ROTATE_CURSOR } from "./cursors";
import { isTypingTarget } from "../../lib/isTypingTarget";
import "./Canvas.css";

// "system" is left unset so the CSS `prefers-color-scheme` rule in
// Canvas.css applies instead of an inline color fighting it.
const CANVAS_BACKGROUND_COLORS: Partial<Record<CanvasBackground, string>> = {
  white: "#ffffff",
  "light-gray": "#c9c9cc",
  gray: "#8a8a8f",
  "dark-gray": "#3f3f46",
  black: "#000000",
};

const DRAWABLE_TOOLS = new Set(["rectangle", "ellipse", "line", "arrow", "pen", "blur", "spotlight", "highlight"]);

export interface CanvasHandle {
  exportDataUrl: () => string | null;
  setZoom: (scale: number) => void;
  zoomToFit: () => void;
}

interface CanvasProps {
  ref?: Ref<CanvasHandle>;
  /** Notified whenever the live zoom level changes (wheel, pinch, or an imperative setZoom/zoomToFit call). */
  onZoomChange?: (scale: number) => void;
}

export function Canvas({ ref, onZoomChange }: CanvasProps) {
  const image = useDocumentStore((s) => s.image);
  const shapes = useDocumentStore((s) => s.shapes);
  const selectedShapeId = useDocumentStore((s) => s.selectedShapeId);
  const selectShape = useDocumentStore((s) => s.selectShape);
  const addShape = useDocumentStore((s) => s.addShape);
  const updateShape = useDocumentStore((s) => s.updateShape);
  const removeShape = useDocumentStore((s) => s.removeShape);
  const commit = useDocumentStore((s) => s.commit);

  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);
  const style = useToolStore((s) => s.style);
  const updateStyle = useToolStore((s) => s.updateStyle);

  const canvasBackground = useUiStore((s) => s.canvasBackground);
  const styleMenuOpen = useUiStore((s) => s.styleMenuOpen);
  const [bgMenuPos, setBgMenuPos] = useState<{ x: number; y: number } | null>(null);

  const imageElement = useImage(image);
  const { view, onWheel, setView } = useZoom();
  const { cropRect, setCropRect, commitCrop, cancelCrop } = useCrop(imageElement, activeTool === "crop");

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const imageNodeRef = useRef<Konva.Image>(null);
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
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
  const previousImageRef = useRef<HTMLImageElement | null>(null);
  // Read from Transformer's boundBoxFunc, which Konva calls with no access to
  // the originating keyboard event — a ref avoids re-rendering on every
  // keystroke just to make the current Shift state available there.
  const shiftPressedRef = useRef(false);

  const [eyedropperSample, setEyedropperSample] = useState<{
    hex: string;
    sampleX: number;
    sampleY: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [magnifierZoom, setMagnifierZoom] = useState(9);
  const showToast = useToastStore((s) => s.show);

  // Renders the stage to a PNG data URL at the image's exact native
  // resolution. Deliberately doesn't touch React selection state (only the
  // Transformer's own Konva-level `nodes([])`) — hiding and restoring it
  // happens within one synchronous call, so nothing ever actually paints
  // with the selection handles removed; going through `selectShape` instead
  // would trigger a React re-render, which matters once this same function
  // also runs from a background effect (below) rather than only on click.
  const performExport = useCallback((): string | null => {
    const stage = stageRef.current;
    if (!stage || !imageElement) return null;
    const priorNodes = transformerRef.current?.nodes() ?? [];
    transformerRef.current?.nodes([]);
    // The drop shadow is purely editor chrome (it falls outside the crop
    // rect below anyway), but Konva still has to rasterize the blur while
    // drawing the layer for export — a 24px gaussian-style blur redrawn at
    // full native resolution (often a multi-x upscale from the on-screen
    // preview) is real, avoidable CPU cost on every copy/save.
    const imageNode = imageNodeRef.current;
    imageNode?.shadowEnabled(false);
    // width/height here are in on-screen (zoomed) pixels, then pixelRatio
    // upsamples back to native resolution — `1 / view.scale` as the ratio
    // doesn't exactly cancel out imageElement.width * view.scale once Konva
    // rounds that screen-space width to a whole pixel internally, so the
    // export came out a pixel short. Deriving pixelRatio from the
    // already-rounded width guarantees the math actually cancels back to
    // the image's exact native size.
    const scaledWidth = Math.round(imageElement.width * view.scale);
    const scaledHeight = Math.round(imageElement.height * view.scale);
    const dataUrl = stage.toDataURL({
      x: view.x,
      y: view.y,
      width: scaledWidth,
      height: scaledHeight,
      pixelRatio: imageElement.width / scaledWidth,
    });
    imageNode?.shadowEnabled(true);
    transformerRef.current?.nodes(priorNodes);
    return dataUrl;
  }, [imageElement, view]);

  // Caches the last export, keyed on the exact shapes/image references that
  // produced it — both only ever change at discrete commit points (shape
  // added, drag/transform finished, style edited), never mid-gesture, so
  // reference equality is a cheap and correct "has anything actually
  // changed" check.
  const exportCacheRef = useRef<{ shapes: Shape[]; image: string | null; dataUrl: string } | null>(null);
  // `performExport`'s identity changes on every pan/zoom (it reads `view`),
  // which would otherwise cancel/reschedule the debounce below on every
  // wheel tick even though panning/zooming never changes what gets
  // exported. Routing through a ref decouples "what to call" from "when to
  // call it" so the effect can depend on the real cache key alone.
  const performExportRef = useRef(performExport);
  performExportRef.current = performExport;

  const getExportDataUrl = useCallback((): string | null => {
    const cache = exportCacheRef.current;
    if (cache && cache.shapes === shapes && cache.image === image) {
      return cache.dataUrl;
    }
    const dataUrl = performExportRef.current();
    if (dataUrl) exportCacheRef.current = { shapes, image, dataUrl };
    return dataUrl;
  }, [shapes, image]);

  // Primes the cache in the background, debounced, whenever the document
  // actually changes — by the time the user clicks Copy/Save, the expensive
  // render+encode has usually already happened, so the click just reuses it
  // instead of paying for it right then.
  useEffect(() => {
    if (!image) return;
    const timer = setTimeout(() => getExportDataUrl(), 600);
    return () => clearTimeout(timer);
  }, [shapes, image, getExportDataUrl]);

  // Keeps the on-screen zoom level centered on the viewport's own center
  // point (rather than the last wheel/cursor position, which is meaningless
  // for a bottom-bar-driven zoom change) when jumping to an absolute scale.
  const applyZoom = useCallback(
    (nextScale: number) => {
      setView((prev) => {
        if (!stageSize) return { ...prev, scale: nextScale };
        const cx = stageSize.width / 2;
        const cy = stageSize.height / 2;
        const imagePointX = (cx - prev.x) / prev.scale;
        const imagePointY = (cy - prev.y) / prev.scale;
        return { scale: nextScale, x: cx - imagePointX * nextScale, y: cy - imagePointY * nextScale };
      });
    },
    [stageSize, setView],
  );

  const zoomToFit = useCallback(() => {
    if (!imageElement || !stageSize) return;
    setView(centeredView(imageElement, stageSize));
  }, [imageElement, stageSize, setView]);

  useEffect(() => {
    onZoomChange?.(view.scale);
  }, [view.scale, onZoomChange]);

  useImperativeHandle(ref, () => ({
    exportDataUrl: getExportDataUrl,
    setZoom: applyZoom,
    zoomToFit,
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

  // useLayoutEffect, not useEffect: this runs synchronously before the
  // browser paints, so the very first frame of a new image already has the
  // correct fitted scale instead of briefly painting at the previous (or
  // default 100%) zoom and then visibly snapping to fit a moment later.
  useLayoutEffect(() => {
    if (!imageElement || !stageSize) return;
    const isNewImage = previousImageRef.current !== imageElement;
    previousImageRef.current = imageElement;

    if (isNewImage) {
      setView(centeredView(imageElement, stageSize));
    } else {
      // Same image, just a window resize (or ResizeObserver re-fire): keep the
      // current zoom level, but re-center it in the new viewport.
      setView((prev) => centeredView(imageElement, stageSize, prev.scale));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageElement, stageSize]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpacePressed(true);
      }
      if (e.key === "Shift") shiftPressedRef.current = true;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedShapeId && !isTypingTarget(e.target)) {
        e.preventDefault();
        removeShape(selectedShapeId);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpacePressed(false);
      if (e.key === "Shift") shiftPressedRef.current = false;
    };
    // If focus leaves the window while Space is held (switching apps, a
    // native dialog stealing focus, etc.), the keyup fires somewhere else
    // and never reaches us — leaving the whole canvas permanently
    // draggable. Releasing on blur is the standard fix for a stuck
    // modifier key.
    const onBlur = () => {
      setSpacePressed(false);
      shiftPressedRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [selectedShapeId, removeShape]);

  // Clears the eyedropper HUD as soon as its tool isn't active anymore.
  useEffect(() => {
    if (activeTool !== "eyedropper") setEyedropperSample(null);
  }, [activeTool]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedShapeId ? nodeRefs.current.get(selectedShapeId) : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
    // `styleMenuOpen` unmounts and remounts the Transformer, which comes back
    // as a fresh instance with no nodes attached — without it in the deps the
    // handles would never reappear after closing a style dropdown.
  }, [selectedShapeId, shapes, styleMenuOpen]);

  const toImagePoint = useCallback(
    (stage: Konva.Stage) => {
      const pointer = stage.getPointerPosition();
      if (!pointer) return null;
      return absoluteToImage(view, pointer);
    },
    [view],
  );

  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      if (activeTool === "eyedropper") {
        // Scrolling over the magnifier zooms it (bigger/smaller pixels)
        // instead of zooming the canvas underneath it.
        e.evt.preventDefault();
        const direction = e.evt.deltaY > 0 ? -1 : 1;
        setMagnifierZoom((z) => Math.min(30, Math.max(3, z + direction)));
        return;
      }
      onWheel(e);
    },
    [activeTool, onWheel],
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
        if (!hex) return;
        updateStyle({ stroke: hex, fillColor: hex });
        // Optimistic: confirm and return to Select right away rather than
        // waiting on the async clipboard write — it's effectively always
        // fast, so waiting just adds a felt delay.
        showToast(`Copied ${hex.toUpperCase()}`);
        setActiveTool("select");
        writeText(hex).catch((err) => {
          console.error("copy hex failed", err);
          showToast("Copy failed — try again");
        });
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
        case "blur":
          shape = { ...base, type: "blur", width: 1, height: 1 };
          break;
        case "spotlight":
          shape = { ...base, type: "spotlight", width: 1, height: 1 };
          break;
        case "highlight":
          shape = { ...base, type: "highlight", points: [0, 0] };
          break;
        default:
          return;
      }
      drawing.current = { shape };
      setLiveShape(shape);
    },
    [spacePressed, activeTool, toImagePoint, selectShape, imageElement, setActiveTool, updateStyle, style],
  );

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (spacePressed) return;
      const stage = stageRef.current;
      if (!stage) return;
      const point = toImagePoint(stage);
      if (!point) return;

      if (activeTool === "eyedropper") {
        const screenPoint = stage.getPointerPosition();
        const hex = imageElement ? sampleColorFromImage(imageElement, point.x, point.y) : null;
        if (hex && screenPoint) {
          setEyedropperSample({ hex, sampleX: point.x, sampleY: point.y, screenX: screenPoint.x, screenY: screenPoint.y });
        } else {
          setEyedropperSample(null);
        }
        return;
      }

      if (!drawing.current) return;
      const { shape } = drawing.current;
      const dx = point.x - shape.x;
      const dy = point.y - shape.y;

      let updated: Shape = shape;
      if (isRectLike(shape)) {
        if (e.evt.shiftKey) {
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          updated = { ...shape, width: Math.sign(dx || 1) * size, height: Math.sign(dy || 1) * size };
        } else {
          updated = { ...shape, width: dx, height: dy };
        }
      } else if (shape.type === "ellipse") {
        if (e.evt.shiftKey) {
          const r = Math.max(Math.abs(dx), Math.abs(dy));
          updated = { ...shape, radiusX: r, radiusY: r };
        } else {
          updated = { ...shape, radiusX: Math.abs(dx), radiusY: Math.abs(dy) };
        }
      } else if (shape.type === "line" || shape.type === "arrow") {
        let [ndx, ndy] = [dx, dy];
        if (e.evt.shiftKey) {
          const step = Math.PI / 4; // 45°
          const angle = Math.round(Math.atan2(dy, dx) / step) * step;
          const dist = Math.hypot(dx, dy);
          ndx = Math.cos(angle) * dist;
          ndy = Math.sin(angle) * dist;
        }
        updated = { ...shape, points: [0, 0, ndx, ndy] };
      } else if (isStrokeLike(shape))
        updated = { ...shape, points: [...shape.points, dx, dy] };

      drawing.current = { shape: updated };
      setLiveShape(updated);
    },
    [spacePressed, activeTool, toImagePoint, imageElement],
  );

  const handleMouseUp = useCallback(() => {
    if (spacePressed) return;

    if (drawing.current) {
      const finished = normalizeShape(drawing.current.shape);
      drawing.current = null;
      setLiveShape(null);
      addShape(finished);
      // Strokes are drawn in runs (several highlighter swipes, several pen
      // marks), so those tools stay selected; everything else returns to Select.
      if (!isStrokeLike(finished)) setActiveTool("select");
    }
  }, [spacePressed, activeTool, addShape, setActiveTool]);

  const handleStageClick = useCallback(
    () => {
      if (spacePressed) return;
      if (activeTool !== "text" && activeTool !== "step") return;
      const stage = stageRef.current;
      // Deliberately not `e.target === stage`. Konva reports the topmost
      // shape under the cursor as the target, so requiring the bare stage
      // meant text and step badges could only be placed on empty image —
      // clicking to number a blurred region, or to label anything already
      // annotated, silently did nothing. Neither tool has any reason to care
      // what is underneath: shapes only respond to clicks while the Select
      // tool is active, so nothing is competing for this one.
      if (!stage) return;
      const point = toImagePoint(stage);
      if (!point) return;

      if (activeTool === "step") {
        // Numbering is derived from the badges actually on the canvas rather
        // than a separate counter, so undo/redo and deleting a badge stay
        // consistent instead of drifting out of sync with a stored count.
        const next =
          shapes.reduce((max, existing) => (existing.type === "step" ? Math.max(max, existing.number) : max), 0) + 1;
        addShape({
          id: createShapeId(),
          type: "step",
          x: point.x,
          y: point.y,
          rotation: 0,
          number: next,
          radius: radiusForFontSize(style.fontSize),
          style,
        });
        // Deliberately stays on the step tool: badges are placed in runs
        // (1, 2, 3…), unlike text where you almost always want to type next.
        return;
      }

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
    [spacePressed, activeTool, toImagePoint, addShape, setActiveTool, style, shapes],
  );

  const handleStageDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      // Konva drag events bubble up from whatever node is actually being
      // dragged (a shape) through to the Stage. Without this guard, dragging
      // a shape also ran this handler with e.target being that shape, not
      // the Stage — writing the shape's small image-space x/y into the
      // view's pan position and yanking the whole canvas along with it.
      if (e.target !== e.currentTarget) return;
      setView((prev) => ({ ...prev, x: e.target.x(), y: e.target.y() }));
    },
    [setView],
  );

  const handleTransformBoundBox = useCallback((oldBox: Konva.Box, newBox: Konva.Box): Konva.Box => {
    if (transformerRef.current?.getActiveAnchor() !== "rotater" || !shiftPressedRef.current) return newBox;
    // Snapping newBox.rotation in place (leaving x/y as Konva computed them
    // for the raw angle) rotates the shape around the wrong pivot — x/y and
    // rotation both encode "rotate around the box's center", so changing one
    // without the other visibly translates the shape instead of just turning
    // it in place. Re-deriving the whole box from oldBox with the snapped
    // target keeps that pivot consistent, the same way Konva itself does
    // internally for the raw (unsnapped) angle.
    const step = Math.PI / 4; // 45°
    const targetRotation = Math.round(newBox.rotation / step) * step;
    return rotateBoxAroundCenter(oldBox, targetRotation);
  }, []);

  const handleTextTransform = useCallback((e: KonvaEventObject<Event>) => {
    const node = e.target;
    if (node.getClassName() !== "Text") return;
    // Left to Konva's default, live-dragging a resize handle stretches the
    // Text node's own scaleX/scaleY — visibly squishing/stretching the
    // glyphs instead of resizing the box. Reflowing into the new width and
    // resetting scale back to 1 on every tick keeps the font looking normal
    // and lets the text just take up the available space; height is never
    // touched here since Konva.Text already auto-grows it from the wrapped
    // line count, not from a manual drag.
    bakeNodeScaleX(node, 20);
  }, []);

  const registerShapeRef = useCallback((id: string) => (node: Konva.Node | null) => {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }, []);

  const editingShape = editingTextId ? shapes.find((s) => s.id === editingTextId) : null;
  const selectedShape = selectedShapeId ? shapes.find((s) => s.id === selectedShapeId) : null;

  return (
    <div
      className="canvas"
      ref={containerRef}
      style={{ background: CANVAS_BACKGROUND_COLORS[canvasBackground] }}
      onContextMenu={(e) => {
        e.preventDefault();
        setBgMenuPos({ x: e.clientX, y: e.clientY });
      }}
      onMouseLeave={() => {
        if (activeTool === "eyedropper") setEyedropperSample(null);
      }}
    >
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
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleStageClick}
        style={{
          cursor: spacePressed
            ? "grab"
            : activeTool === "select"
              ? hoveredShapeId
                ? MOVE_CURSOR
                : "default"
              : "crosshair",
        }}
      >
        <Layer>
          {imageElement && (
            <KonvaImage
              ref={imageNodeRef}
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
              onMouseEnter={() => activeTool === "select" && setHoveredShapeId(shape.id)}
              onMouseLeave={() => setHoveredShapeId((id) => (id === shape.id ? null : id))}
              onDragStart={commit}
              onDragEnd={(e) => updateShape(shape.id, { x: e.target.x(), y: e.target.y() })}
              onTransform={handleTextTransform}
              onTransformEnd={(e) => {
                const node = e.target as Konva.Node;
                commit();
                updateShape(shape.id, getTransformPatch(shape, node));
              }}
            />
          ))}

          {liveShape && <ShapeRenderer shape={liveShape} draggable={false} onClick={() => {}} onTap={() => {}} onDragEnd={() => {}} onTransformEnd={() => {}} />}

          {activeTool === "select" && !styleMenuOpen && (
            <Transformer
              ref={transformerRef}
              rotateEnabled={supportsRotation(selectedShape)}
              keepRatio={selectedShape?.type === "step"}
              rotateAnchorCursor={ROTATE_CURSOR}
              boundBoxFunc={handleTransformBoundBox}
              enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
              anchorSize={14}
              anchorCornerRadius={7}
              anchorFill="#3d7bfd"
              anchorStroke="#ffffff"
              anchorStrokeWidth={2}
              borderStroke="#3d7bfd"
              borderStrokeWidth={1.5}
            />
          )}

          {cropRect && imageElement && activeTool === "crop" && (
            <CropOverlay imageElement={imageElement} cropRect={cropRect} view={view} onChange={setCropRect} />
          )}
        </Layer>
      </Stage>
      )}

      {editingShape && editingShape.type === "text" && (
        <TextEditorOverlay
          shape={editingShape}
          view={view}
          onCommit={(text) => {
            // Trailing blank lines (an IME confirm-Enter slipping through
            // before the composing-guard above, or a stray paste) don't
            // show any visible glyphs but still count toward Konva's
            // line-count-based auto height, making the box taller than the
            // text actually looks.
            updateShape(editingShape.id, { text: text.replace(/\n+$/, "") });
            setEditingTextId(null);
            // Konva.Text's height is auto-derived from wrapped line count,
            // not an attr the Transformer's own change-listeners watch for —
            // its cached selection box can end up one text change behind
            // (visibly wrong until something else, like a font-size tweak,
            // happens to force a recompute). One extra frame after the
            // commit is enough for the Text node to have re-measured itself.
            requestAnimationFrame(() => transformerRef.current?.forceUpdate());
          }}
          onCancel={() => setEditingTextId(null)}
        />
      )}

      {cropRect && (
        <div className="canvas__crop-actions">
          <button
            type="button"
            onClick={() => {
              commitCrop();
              setActiveTool("select");
            }}
          >
            Crop
          </button>
          <button
            type="button"
            onClick={() => {
              cancelCrop();
              setActiveTool("select");
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {bgMenuPos && <CanvasBackgroundMenu x={bgMenuPos.x} y={bgMenuPos.y} onClose={() => setBgMenuPos(null)} />}

      {activeTool === "eyedropper" && eyedropperSample && imageElement && (
        <EyedropperHud
          screenX={eyedropperSample.screenX}
          screenY={eyedropperSample.screenY}
          imageElement={imageElement}
          sampleX={eyedropperSample.sampleX}
          sampleY={eyedropperSample.sampleY}
          hex={eyedropperSample.hex}
          zoom={magnifierZoom}
        />
      )}
    </div>
  );
}

/**
 * Re-derives a Transformer bounding box ({x,y,width,height,rotation}, all in
 * absolute coordinates, rotation in radians) at a new target rotation while
 * keeping its center fixed — the same "rotate around center" math Konva uses
 * internally, exposed here so a caller can substitute a snapped target angle
 * and still get a correctly-translated x/y to go with it.
 */
function rotateBoxAroundCenter(box: Konva.Box, targetRotation: number): Konva.Box {
  const center = {
    x: box.x + (box.width / 2) * Math.cos(box.rotation) - (box.height / 2) * Math.sin(box.rotation),
    y: box.y + (box.height / 2) * Math.cos(box.rotation) + (box.width / 2) * Math.sin(box.rotation),
  };
  const delta = targetRotation - box.rotation;
  const x = center.x + (box.x - center.x) * Math.cos(delta) - (box.y - center.y) * Math.sin(delta);
  const y = center.y + (box.x - center.x) * Math.sin(delta) + (box.y - center.y) * Math.cos(delta);
  return { ...box, x, y, rotation: targetRotation };
}

// A very short/near-zero-length line has a near-degenerate bounding box, and
// Konva's Transformer can't derive a usable rotate handle from that — the
// handle ends up sitting on top of (or inside) the resize anchors instead of
// clear of them. Arrow never hits this because its arrowhead has its own
// fixed minimum visual size regardless of point length; a plain line has no
// such floor, so one is enforced here instead.
const MIN_LINE_LENGTH = 12;

function normalizeShape(shape: Shape): Shape {
  if (isRectLike(shape)) {
    const x = Math.min(shape.x, shape.x + shape.width);
    const y = Math.min(shape.y, shape.y + shape.height);
    return { ...shape, x, y, width: Math.abs(shape.width), height: Math.abs(shape.height) };
  }
  if (isSegment(shape)) {
    const [x1, y1, x2, y2] = shape.points;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < MIN_LINE_LENGTH) {
      const angle = length > 0 ? Math.atan2(y2 - y1, x2 - x1) : 0;
      return { ...shape, points: [0, 0, Math.cos(angle) * MIN_LINE_LENGTH, Math.sin(angle) * MIN_LINE_LENGTH] };
    }
  }
  return shape;
}
