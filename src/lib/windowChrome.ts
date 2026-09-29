import { useEffect } from "react";

/**
 * Resolves once the browser has actually painted.
 *
 * Two frames, not one: the first callback runs *before* the paint that
 * follows the pending style/layout changes, so anything scheduled there is
 * still only queued. The second runs after that paint has happened, which
 * is the point where it's safe to reveal a window or start a long
 * synchronous block without the previous frame being swallowed.
 *
 * Written out longhand as nested `requestAnimationFrame` calls in three
 * places (the overlay's ready signal, the editor's, and the Save toast)
 * before this existed — the nesting reads like a typo unless you already
 * know why it's there.
 */
export function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Makes this window's document transparent, for the chromeless windows
 * (capture overlay, history bar) that draw their own floating UI over
 * whatever is behind them.
 *
 * Set directly on the elements rather than via a CSS rule for two reasons:
 * every shota window shares one bundle (see App.tsx), so a rule targeting
 * html/body/#root would leak into the other windows' documents; and an
 * inline style reliably beats the shared stylesheet's opaque `#root`
 * background, which a rule can lose to depending on injection order. Each
 * Tauri window is its own document, so this only affects the calling one.
 */
export function useTransparentWindow() {
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const root = document.getElementById("root");
    if (root) root.style.background = "transparent";
  }, []);
}
