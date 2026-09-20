import { useEffect, useState } from "react";
import { tauriApi } from "../../lib/tauriApi";

/** Shown immediately and kept as a fallback if the system font list can't be read. */
const FALLBACK_FONTS = ["Segoe UI", "Arial", "Georgia", "Courier New", "Trebuchet MS", "Comic Sans MS", "Impact"];

// Module-level cache: the font list doesn't change while the app is running,
// and every mount of the options panel would otherwise re-issue the same
// native call.
let cachedFonts: string[] | null = null;
let inFlight: Promise<string[]> | null = null;

function loadSystemFonts(): Promise<string[]> {
  if (cachedFonts) return Promise.resolve(cachedFonts);
  if (!inFlight) {
    inFlight = tauriApi
      .listSystemFonts()
      .then((fonts) => (cachedFonts = fonts.length > 0 ? fonts : FALLBACK_FONTS))
      .catch(() => (cachedFonts = FALLBACK_FONTS));
  }
  return inFlight;
}

/**
 * Appends a generic fallback so an uninstalled/mistyped family name never
 * renders blank, and always quotes the family name itself. Unquoted works
 * for plain ASCII names like "Segoe UI", but real installed-font lists
 * (queried straight from DirectWrite, no filtering) can include names with
 * characters that aren't valid in an unquoted CSS ident — a font string the
 * canvas 2D context silently fails to parse falls back to its *previous*
 * font, so every width/line-wrap measurement Konva does for that text is
 * for the wrong font entirely, throwing off the auto-computed box height
 * without touching the glyphs actually drawn on screen (whichever font last
 * parsed successfully stays active for that).
 */
export function cssFontFamily(name: string): string {
  return `"${name.replace(/"/g, '\\"')}", sans-serif`;
}

/**
 * Fonts actually installed on this machine (queried from Rust via
 * DirectWrite) — nothing bundled or downloaded, so the list is exactly what
 * will really render. Starts with a small safe fallback and swaps in the
 * real list once the (cheap, one-time) native call resolves.
 */
export function useSystemFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(cachedFonts ?? FALLBACK_FONTS);

  useEffect(() => {
    if (cachedFonts) return;
    let cancelled = false;
    loadSystemFonts().then((result) => {
      if (!cancelled) setFonts(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return fonts;
}
