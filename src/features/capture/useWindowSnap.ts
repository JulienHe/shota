import { useEffect, useState } from "react";
import { CapturableWindow, tauriApi } from "../../lib/tauriApi";

/**
 * Tracks whether the user is holding Space (window-snap mode) and, if so,
 * which capturable window the given global cursor position currently sits over.
 */
export function useWindowSnap(globalCursor: { x: number; y: number } | null) {
  const [snapMode, setSnapMode] = useState(false);
  const [windows, setWindows] = useState<CapturableWindow[]>([]);

  useEffect(() => {
    tauriApi.listCapturableWindows().then(setWindows).catch(() => setWindows([]));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setSnapMode(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSnapMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const hoveredWindow =
    snapMode && globalCursor
      ? windows.find(
          (w) =>
            globalCursor.x >= w.x &&
            globalCursor.x <= w.x + w.width &&
            globalCursor.y >= w.y &&
            globalCursor.y <= w.y + w.height,
        ) ?? null
      : null;

  return { snapMode, hoveredWindow };
}
