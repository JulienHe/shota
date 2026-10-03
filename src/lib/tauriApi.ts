import { invoke } from "@tauri-apps/api/core";

export interface CapturableWindow {
  id: number;
  title: string;
  app_name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PendingCapture {
  /** Key for fetching the image itself via `takeCaptureImage` — the bytes
   * deliberately don't ride along in this payload, which is JSON. */
  image_id: string;
  history_id: string | null;
  shapes_json: string | null;
}

export interface HistoryListItem {
  id: string;
  created_at: number;
  width: number;
  height: number;
  thumbnail_base64: string;
}

/** Thin, typed wrappers around every Rust command shota exposes. */
export const tauriApi = {
  listCapturableWindows: () => invoke<CapturableWindow[]>("list_capturable_windows"),

  finishRegionCapture: (x: number, y: number, width: number, height: number) =>
    invoke<void>("finish_region_capture", { x, y, width, height }),

  finishWindowCapture: (windowId: number) =>
    invoke<void>("finish_window_capture", { windowId }),

  cancelCapture: () => invoke<void>("cancel_capture"),

  openCaptureOverlay: () => invoke<void>("open_capture_overlay_command"),

  overlayReady: () => invoke<void>("overlay_ready"),

  captureFullscreenNow: (monitorId?: number) =>
    invoke<void>("capture_fullscreen_now", { monitorId: monitorId ?? null }),

  takePendingCapture: () => invoke<PendingCapture | null>("take_pending_capture"),

  /** Raw PNG bytes for a capture. Comes back as an ArrayBuffer rather than
   * JSON (the Rust command returns an `ipc::Response`), so a multi-megabyte
   * screenshot never has to be base64'd, JSON-escaped, or re-parsed as a
   * giant JS string. */
  takeCaptureImage: (id: string) => invoke<ArrayBuffer>("take_capture_image", { id }),

  editorReady: () => invoke<void>("editor_ready"),

  closeEditorWindow: () => invoke<void>("close_editor_window"),

  copyImageToClipboard: (pngBase64: string) =>
    invoke<void>("copy_image_to_clipboard", { pngBase64 }),

  saveImageAs: (pngBase64: string, suggestedName: string) =>
    invoke<string | null>("save_image_as", { pngBase64, suggestedName }),

  /** The UI locale, resolved on the Rust side from the user's choice or the
   * OS language, so the native menus and the webview always agree. */
  getLocale: () => invoke<string>("get_locale"),

  /** The explicit language choice, or null when following the OS. */
  getLanguage: () => invoke<string | null>("get_language"),

  setLanguage: (language: string | null) => invoke<void>("set_language", { language }),

  supportedLocales: () => invoke<string[]>("supported_locales"),

  getShortcuts: () => invoke<{ fullscreen: string; area: string }>("get_shortcuts"),

  setShortcut: (kind: "fullscreen" | "area", accelerator: string) =>
    invoke<void>("set_shortcut", { kind, accelerator }),

  listSystemFonts: () => invoke<string[]>("list_system_fonts"),

  listHistory: () => invoke<HistoryListItem[]>("list_history"),

  openHistoryEntry: (id: string) => invoke<void>("open_history_entry", { id }),

  /** Persists annotations only — the base image never changes in the editor,
   * and Rust already wrote it to disk at capture time. */
  updateHistoryEntry: (id: string, shapesJson: string, width: number, height: number) =>
    invoke<void>("update_history_entry", { id, shapesJson, width, height }),

  /** Copies a stored capture to the clipboard without opening it. The bytes
   * never cross IPC — Rust reads the file and writes the clipboard itself.
   * Note this is the capture as taken, without any saved annotations. */
  copyHistoryEntry: (id: string) => invoke<void>("copy_history_entry", { id }),

  deleteHistoryEntry: (id: string) => invoke<void>("delete_history_entry", { id }),

  clearHistory: () => invoke<void>("clear_history"),

  historyReady: () => invoke<void>("history_ready"),

  closeHistoryWindow: () => invoke<void>("close_history_window_command"),
};

/** Strips the `data:image/png;base64,` prefix so raw base64 can cross the IPC boundary. */
export function toBase64Payload(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

export function toDataUrl(base64: string): string {
  return `data:image/png;base64,${base64}`;
}
