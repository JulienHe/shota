const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

/**
 * Turns a raw KeyboardEvent into a Tauri accelerator string (e.g. "Ctrl+Shift+4"),
 * or null while only modifier keys are held (not yet a complete combo).
 */
export function formatAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");

  if (parts.length === 0) return null; // require at least one modifier to avoid stealing plain keys

  const key = normalizeKey(e.key, e.code);
  if (!key) return null;

  parts.push(key);
  return parts.join("+");
}

function normalizeKey(key: string, code: string): string | null {
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toUpperCase();
  if (/^F[1-9][0-9]?$/.test(key)) return key;

  const named: Record<string, string> = {
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Escape: "Escape",
    Tab: "Tab",
    Enter: "Enter",
  };
  if (named[key]) return named[key];

  // Fall back to the physical key code for punctuation, e.g. "Digit4" -> "4".
  const digitMatch = code.match(/^Digit(\d)$/);
  if (digitMatch) return digitMatch[1];
  const letterMatch = code.match(/^Key([A-Z])$/);
  if (letterMatch) return letterMatch[1];

  return null;
}
