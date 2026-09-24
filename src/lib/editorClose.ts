import { useDocumentStore } from "../stores/documentStore";
import { tauriApi, toBase64Payload } from "./tauriApi";

/**
 * The editor window is cloaked (not destroyed, and not `.hide()`-d either)
 * on every exit path — Copy, Save, the title bar's close button — and
 * reused for the next capture, so it doesn't have to rebuild its whole page
 * from scratch every single time (see `open_editor_window` in editor.rs).
 * Deliberately not the plain `getCurrentWindow().hide()`: once the window's
 * been shown for real, `WS_VISIBLE` needs to stay true permanently for DWM
 * cloaking to reliably reveal it again later — actually hiding it here
 * undoes that and is what silently broke the second capture in a session.
 *
 * Whatever annotations exist are persisted back to the capture's history
 * entry first, fire-and-forget — same reasoning as the clipboard write in
 * handleCopy: the Rust side keeps running after the window's cloaked, so
 * there's no need to block on it.
 */
export function closeEditor() {
  const { historyId, image, shapes } = useDocumentStore.getState();
  if (historyId && image) {
    tauriApi.updateHistoryEntry(historyId, toBase64Payload(image), JSON.stringify(shapes)).catch((err) => {
      console.error("failed to save history annotations", err);
    });
  }
  tauriApi.closeEditorWindow();
}
