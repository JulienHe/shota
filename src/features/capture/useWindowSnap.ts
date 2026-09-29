import { useEffect, useState } from "react";
import { CapturableWindow, tauriApi } from "../../lib/tauriApi";

/**
 * Tracks window-snap mode, toggled by a single Space press (press once to
 * enter, press again to leave — not held), and, while active, which
 * capturable window the given global cursor position currently sits over.
 */
export function useWindowSnap(globalCursor: { x: number; y: number } | null) {
  const [snapMode, setSnapMode] = useState(false);
  const [windows, setWindows] = useState<CapturableWindow[]>([]);

  // Refetched every time snap mode is entered, not once on mount. The
  // overlay window is reused rather than recreated between captures, so this
  // component only ever mounts once per app session — and that one mount
  // happens during pre-warm, at app startup. Fetching there meant snapping
  // was matched against whatever windows existed the moment Shota launched:
  // nothing opened since was selectable, anything closed or moved since had
  // stale bounds, and a single failed enumeration at startup left the list
  // permanently empty, so window selection silently did nothing for the rest
  // of the session.
  useEffect(() => {
    if (!snapMode) return;
    let cancelled = false;
    tauriApi
      .listCapturableWindows()
      .then((list) => {
        if (!cancelled) setWindows(list);
      })
      .catch((err) => {
        console.error("failed to list capturable windows", err);
        if (!cancelled) setWindows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [snapMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // e.repeat filters out the auto-repeat keydown events an OS sends for
      // a held key — without it, holding Space would flip the toggle many
      // times a second instead of once per physical press.
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSnapMode((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
