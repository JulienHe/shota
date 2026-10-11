/**
 * One spelling for keyboard shortcuts across the whole app: what the
 * recorder writes, what's saved in settings, what the editor matches key
 * presses against, and what Rust hands to the global-shortcut plugin. The
 * format is the plugin's ("Ctrl+Shift+4", "PrintScreen"), so a global
 * shortcut can go straight from a key press to the OS untranslated.
 */

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph"]);

const NAMED_KEYS: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Escape",
  Tab: "Tab",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  PrintScreen: "PrintScreen",
  Pause: "Pause",
  ScrollLock: "ScrollLock",
};

/** Punctuation goes by physical key, because what `key` reports for it
 * depends on the layout and on Shift ~ and these names are what the
 * global-shortcut plugin parses. */
const PUNCTUATION_CODES = new Set([
  "Backquote",
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Semicolon",
  "Quote",
  "Comma",
  "Period",
  "Slash",
]);

function keyName(key: string, code: string): string | null {
  // Letters by the character the layout produces, so an AZERTY user's "A"
  // is the key labelled A, which is also what Windows' own hotkeys do.
  if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase();
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  if (NAMED_KEYS[key]) return NAMED_KEYS[key];
  // Digits by physical key: on AZERTY the unshifted number row types "&é"…
  const digit = code.match(/^(?:Digit|Numpad)(\d)$/);
  if (digit) return digit[1];
  if (PUNCTUATION_CODES.has(code)) return code;
  if (/^[0-9]$/.test(key)) return key;
  const letter = code.match(/^Key([A-Z])$/);
  if (letter) return letter[1];
  return null;
}

/** The accelerator a key event spells, or null while only modifiers are held
 * or for a key with no name. */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const key = keyName(e.key, e.code);
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  parts.push(key);
  return parts.join("+");
}

export function sameAccelerator(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const MODIFIERS = new Set(["ctrl", "alt", "shift", "super"]);

function hasModifier(accelerator: string): boolean {
  return accelerator.split("+").some((part) => MODIFIERS.has(part.toLowerCase()));
}

function mainKey(accelerator: string): string {
  const parts = accelerator.split("+");
  return parts[parts.length - 1];
}

/** Keys that are fine as a global shortcut on their own: nothing else uses
 * them while typing. Anything else alone would be stolen from every app. */
const BARE_GLOBAL_KEYS = /^(PrintScreen|Pause|ScrollLock|F1[3-9]|F2[0-4])$/;

/** Keys the editor already uses for itself and that people expect to keep
 * their meaning: Esc cancels, Delete removes, Space pans, Enter confirms. */
const RESERVED_EDITOR_KEYS = new Set(["Escape", "Delete", "Backspace", "Space", "Enter", "Tab"]);

export type AcceleratorScope = "global" | "editor";
export type AcceleratorProblem = "needsModifier" | "reserved";

export function checkAccelerator(accelerator: string, scope: AcceleratorScope): AcceleratorProblem | null {
  const key = mainKey(accelerator);
  if (scope === "global") {
    return hasModifier(accelerator) || BARE_GLOBAL_KEYS.test(key) ? null : "needsModifier";
  }
  return !hasModifier(accelerator) && RESERVED_EDITOR_KEYS.has(key) ? "reserved" : null;
}
