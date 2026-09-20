import { useEffect } from "react";

interface ShortcutOptions {
  ctrl?: boolean;
  shift?: boolean;
  key: string;
  /** Prevents the browser/webview default (e.g. Ctrl+S opening a native save prompt). */
  preventDefault?: boolean;
  enabled?: boolean;
}

/** Binds a single in-window keyboard shortcut (as opposed to the global OS-level ones in Rust). */
export function useKeyboardShortcut(
  { ctrl = false, shift = false, key, preventDefault = true, enabled = true }: ShortcutOptions,
  handler: () => void,
  deps: React.DependencyList = [],
) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const matchesKey = event.key.toLowerCase() === key.toLowerCase();
      const matchesCtrl = ctrl ? event.ctrlKey || event.metaKey : true;
      const matchesShift = event.shiftKey === shift;

      if (matchesKey && matchesCtrl && matchesShift) {
        if (preventDefault) event.preventDefault();
        handler();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrl, shift, key, enabled, ...deps]);
}
