/** Input types a letter key means nothing to. A slider, checkbox or colour
 * well keeps focus after you use it, so treating every `<input>` as a typing
 * target means dragging any style slider silently kills every bare-key
 * shortcut until the user happens to click elsewhere. */
const NON_TEXT_INPUT_TYPES = new Set([
  "range",
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "color",
  "file",
  "image",
]);

/**
 * True while the user is typing somewhere a key press means a character
 * rather than a shortcut.
 *
 * Lives here, shared, because it existed twice before — once in the toolbar
 * (guarding the tool letters) and once in the canvas (guarding Space-to-pan
 * and Delete-to-remove) — and only one copy got the slider fix, so half the
 * shortcuts in the editor stayed broken after using a style slider.
 *
 * Pass an event's `target` where there is one; with no argument it falls
 * back to `document.activeElement`, which is what a handler that only sees
 * a `code`/`key` has to work from.
 */
export function isTypingTarget(target: EventTarget | null = document.activeElement): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return false;
}
