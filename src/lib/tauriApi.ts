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
  /** Key for fetching the image itself via `takeCaptureImage` ~ the bytes
   * deliberately don't ride along in this payload, which is JSON. */
  image_id: string;
  history_id: string | null;
  shapes_json: string | null;
}

export type ShortcutKind = "fullscreen" | "area" | "history";
export type GlobalShortcuts = Record<ShortcutKind, string>;

export type ImageFormat = "png" | "jpeg" | "webp";
export type CanvasBackground = "white" | "light-gray" | "gray" | "dark-gray" | "black" | "system";
export type ThemePreference = "system" | "light" | "dark";

/** Mirrors `Preferences` in state.rs. Sent and saved as one object. */
export interface Preferences {
  theme: ThemePreference;
  /** null: start where the last save went. */
  saveDir: string | null;
  fileNamePattern: string;
  imageFormat: ImageFormat;
  imageQuality: number;
  /** null: unlimited. */
  historyLimit: number | null;
  /** null: never expire. */
  historyMaxAgeDays: number | null;
  /** Overrides only, keyed by editor action id. */
  editorShortcuts: Record<string, string>;
  canvasBackground: CanvasBackground;
}

export interface StartupStatus {
  enabled: boolean;
  blocked: "byUser" | "byPolicy" | null;
}

export interface HistoryUsage {
  count: number;
  bytes: number;
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

  /** `suggestedName` has no extension; Rust adds the one `format` needs. */
  saveImageAs: (imageBase64: string, suggestedName: string, format: ImageFormat) =>
    invoke<string | null>("save_image_as", { imageBase64, suggestedName, format }),

  /** Whether Windows is holding Print Screen for the Snipping Tool, which
   * silently swallows Shota's default capture shortcut. */
  printScreenOwnedBySnippingTool: () => invoke<boolean>("print_screen_owned_by_snipping_tool"),

  /** Hands Print Screen back to applications. Per-user, no elevation. */
  releasePrintScreen: () => invoke<void>("release_print_screen"),

  /** False in the Store build, which gets its updates from the Store. */
  updatesSupported: () => invoke<boolean>("updates_supported"),

  /** Reports its result in a native dialog. */
  checkForUpdates: () => invoke<void>("check_for_updates"),

  /** The UI locale, resolved on the Rust side from the user's choice or the
   * OS language, so the native menus and the webview always agree. */
  getLocale: () => invoke<string>("get_locale"),

  /** The explicit language choice, or null when following the OS. */
  getLanguage: () => invoke<string | null>("get_language"),

  setLanguage: (language: string | null) => invoke<void>("set_language", { language }),

  supportedLocales: () => invoke<string[]>("supported_locales"),

  getShortcuts: () => invoke<GlobalShortcuts>("get_shortcuts"),

  defaultShortcuts: () => invoke<GlobalShortcuts>("default_shortcuts"),

  /** Rejects with "conflict" when another global shortcut already uses it. */
  setShortcut: (kind: ShortcutKind, accelerator: string) =>
    invoke<void>("set_shortcut", { kind, accelerator }),

  /** Releases the global shortcuts while one is being recorded, so pressing
   * it reaches the recorder instead of triggering a capture. */
  pauseGlobalShortcuts: (paused: boolean) => invoke<void>("pause_global_shortcuts", { paused }),

  getPreferences: () => invoke<Preferences>("get_preferences"),

  /** Resolves with what was actually saved, after Rust clamps bad values. */
  setPreferences: (preferences: Preferences) => invoke<Preferences>("set_preferences", { preferences }),

  getLaunchAtStartup: () => invoke<StartupStatus>("get_launch_at_startup"),

  setLaunchAtStartup: (enabled: boolean) => invoke<StartupStatus>("set_launch_at_startup", { enabled }),

  historyUsage: () => invoke<HistoryUsage>("history_usage"),

  /** Raw bytes of the current desktop wallpaper. Rejects for a solid-colour
   * desktop, which has no image. */
  desktopWallpaper: () => invoke<ArrayBuffer>("desktop_wallpaper"),

  /** Raw bytes of an image the user picked as a frame background. */
  readBackgroundImage: (path: string) => invoke<ArrayBuffer>("read_background_image", { path }),

  listSystemFonts: () => invoke<string[]>("list_system_fonts"),

  listHistory: () => invoke<HistoryListItem[]>("list_history"),

  openHistoryEntry: (id: string) => invoke<void>("open_history_entry", { id }),

  /** Persists annotations only ~ the base image never changes in the editor,
   * and Rust already wrote it to disk at capture time. */
  updateHistoryEntry: (id: string, shapesJson: string, width: number, height: number) =>
    invoke<void>("update_history_entry", { id, shapesJson, width, height }),

  /** Copies a stored capture to the clipboard without opening it. The bytes
   * never cross IPC ~ Rust reads the file and writes the clipboard itself.
   * Note this is the capture as taken, without any saved annotations. */
  copyHistoryEntry: (id: string) => invoke<void>("copy_history_entry", { id }),

  deleteHistoryEntry: (id: string) => invoke<void>("delete_history_entry", { id }),

  clearHistory: () => invoke<void>("clear_history"),

  historyReady: () => invoke<void>("history_ready"),

  closeHistoryWindow: () => invoke<void>("close_history_window_command"),
};

/** Strips the `data:image/…;base64,` prefix so raw base64 can cross the IPC boundary. */
export function toBase64Payload(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

export function toDataUrl(base64: string): string {
  return `data:image/png;base64,${base64}`;
}
