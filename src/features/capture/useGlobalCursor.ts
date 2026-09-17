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
    getCurrentWindow()
      .outerPosition()
      .then((pos) => {
        originRef.current = { x: pos.x, y: pos.y };
        setOrigin({ x: pos.x, y: pos.y });
      });
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
