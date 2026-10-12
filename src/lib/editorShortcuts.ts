import { useEffect, useMemo, useRef } from "react";
import { usePreferencesStore } from "../stores/preferencesStore";
import { eventToAccelerator, sameAccelerator } from "./accelerator";
import { isTypingTarget } from "./isTypingTarget";

/**
 * Every rebindable shortcut inside the editor, with its default.
 *
 * The defaults live here rather than in Rust because only the editor uses
 * them. Settings stores overrides alone, so an action added later picks up
 * its default without any migration, and "reset" is just deleting the
 * override.
 *
 * `label` is a translation key. Tool labels reuse the toolbar's own
 * tooltips so the two can't name the same tool differently.
 */
export const EDITOR_ACTIONS = [
  { id: "tool.select", label: "tools.select", default: "V" },
  { id: "tool.rectangle", label: "tools.rectangle", default: "R" },
  { id: "tool.ellipse", label: "tools.ellipse", default: "O" },
  { id: "tool.line", label: "tools.line", default: "L" },
  { id: "tool.arrow", label: "tools.arrow", default: "A" },
  { id: "tool.text", label: "tools.text", default: "T" },
  { id: "tool.pen", label: "tools.pen", default: "P" },
  { id: "tool.step", label: "tools.step", default: "N" },
  { id: "tool.highlight", label: "tools.highlight", default: "H" },
  { id: "tool.spotlight", label: "tools.spotlight", default: "S" },
  { id: "tool.blur", label: "tools.blur", default: "B" },
  { id: "tool.crop", label: "tools.crop", default: "C" },
  { id: "tool.eyedropper", label: "tools.eyedropper", default: "I" },
  { id: "tool.background", label: "background.title", default: "F" },
  { id: "copy", label: "editor.copy", default: "Ctrl+C" },
  { id: "save", label: "settings.actionSave", default: "Ctrl+S" },
  { id: "undo", label: "settings.actionUndo", default: "Ctrl+Z" },
  { id: "redo", label: "settings.actionRedo", default: "Ctrl+Shift+Z" },
] as const;

export type EditorActionId = (typeof EDITOR_ACTIONS)[number]["id"];

export function resolveBindings(overrides: Record<string, string> | undefined): Record<EditorActionId, string> {
  const bindings = {} as Record<EditorActionId, string>;
  for (const action of EDITOR_ACTIONS) {
    bindings[action.id] = overrides?.[action.id] ?? action.default;
  }
  return bindings;
}

/** The current binding for every editor action, kept live. */
export function useEditorBindings(): Record<EditorActionId, string> {
  const overrides = usePreferencesStore((s) => s.preferences?.editorShortcuts);
  // Memoised on the overrides object, which only changes when settings are
  // saved, so listeners keyed on the result aren't rebuilt every render.
  return useMemo(() => resolveBindings(overrides), [overrides]);
}

/**
 * Runs the handler for whichever action a key press is bound to.
 *
 * Nothing fires while typing in a text field, modified or not: inside the
 * text tool's box, Ctrl+C should copy the selected words and Ctrl+Z should
 * undo typing, not export the whole image or undo the last shape.
 */
export function useEditorShortcuts(handlers: Partial<Record<EditorActionId, () => void>>) {
  const bindings = useEditorBindings();
  // Handlers are usually fresh closures each render; reading them through a
  // ref keeps one stable listener instead of re-adding it every render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const pressed = eventToAccelerator(event);
      if (!pressed) return;
      for (const [id, accelerator] of Object.entries(bindings) as [EditorActionId, string][]) {
        const handler = handlersRef.current[id];
        if (handler && sameAccelerator(pressed, accelerator)) {
          event.preventDefault();
          handler();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bindings]);
}
