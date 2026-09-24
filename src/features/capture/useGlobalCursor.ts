import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Converts local mouse-move events on the (fullscreen) overlay window into
 * absolute virtual-desktop pixel coordinates, matching the coordinate space
 * xcap uses for monitor/window capture.
 */
export function useGlobalCursor() {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    const refreshOrigin = () =>
      win.outerPosition().then((pos) => {
        originRef.current = { x: pos.x, y: pos.y };
        setOrigin({ x: pos.x, y: pos.y });
      });

    refreshOrigin();

    // The overlay window is reused (repositioned, not recreated) across
    // captures to avoid reloading its page every time — so this component
    // only ever mounts once per app session. Without this, `origin` would
    // stay fixed at wherever the window happened to be on that first mount
    // (including its off-screen pre-warm spot), silently producing garbage
    // capture coordinates on every capture after the first.
    const unlisten = win.onMoved(({ payload }) => {
      originRef.current = { x: payload.x, y: payload.y };
      setOrigin({ x: payload.x, y: payload.y });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const origin = originRef.current;
      if (!origin) return;
      const scale = window.devicePixelRatio || 1;
      setCursor({ x: origin.x + e.clientX * scale, y: origin.y + e.clientY * scale });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return { cursor, origin, scale: window.devicePixelRatio || 1 };
}
