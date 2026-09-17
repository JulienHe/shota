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

  takePendingImage: () => invoke<string | null>("take_pending_image"),

  copyImageToClipboard: (pngBase64: string) =>
    invoke<void>("copy_image_to_clipboard", { pngBase64 }),

  saveImageAs: (pngBase64: string, suggestedName: string) =>
    invoke<string | null>("save_image_as", { pngBase64, suggestedName }),

  getShortcuts: () => invoke<{ fullscreen: string; area: string }>("get_shortcuts"),

  setShortcut: (kind: "fullscreen" | "area", accelerator: string) =>
    invoke<void>("set_shortcut", { kind, accelerator }),
};

/** Strips the `data:image/png;base64,` prefix so raw base64 can cross the IPC boundary. */
export function toBase64Payload(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

export function toDataUrl(base64: string): string {
  return `data:image/png;base64,${base64}`;
}
