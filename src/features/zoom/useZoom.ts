import { useCallback, useState } from "react";
import { KonvaEventObject } from "konva/lib/Node";

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export function useZoom(initial: ZoomState = { scale: 1, x: 0, y: 0 }) {
  const [view, setView] = useState<ZoomState>(initial);

  const onWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    setView((prev) => {
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.08;
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, direction > 0 ? prev.scale * factor : prev.scale / factor),
      );

      const mousePointTo = {
        x: (pointer.x - prev.x) / prev.scale,
        y: (pointer.y - prev.y) / prev.scale,
      };

      return {
        scale: nextScale,
        x: pointer.x - mousePointTo.x * nextScale,
        y: pointer.y - mousePointTo.y * nextScale,
      };
    });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setView((prev) => ({
      ...prev,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor)),
    }));
  }, []);

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  return { view, onWheel, zoomBy, reset, setView };
}
