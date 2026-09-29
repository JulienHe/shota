/**
 * A fake Tauri backend, injected before the app's own scripts run.
 *
 * Shota's frontend is an ordinary web app; the only thing it needs that a
 * plain browser doesn't provide is the IPC bridge. `@tauri-apps/api` routes
 * everything — commands, events, window handles — through
 * `window.__TAURI_INTERNALS__`, so defining that object is enough to run the
 * real UI, unmodified, in headless Chromium.
 *
 * This is deliberately a screenshot harness and not a test double: it
 * answers the handful of commands the windows call while rendering, and
 * anything else resolves to null rather than throwing, so a new command
 * doesn't break shot generation until someone actually needs it mocked.
 *
 * Built as a string and injected with `addInitScript` because it has to
 * install before any app module evaluates.
 */
export function mockTauri({ label, captureBase64, historyThumbnails = [] }) {
  return `
    (() => {
      const CAPTURE_BASE64 = ${JSON.stringify(captureBase64)};
      const HISTORY = ${JSON.stringify(historyThumbnails)};

      const bytes = (b64) => {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out.buffer;
      };

      const HANDLERS = {
        // The editor asks for this on mount and renders nothing until it
        // resolves, so the whole shot hangs on it.
        take_pending_capture: () => ({
          image_id: "sample",
          history_id: "sample",
          shapes_json: null,
        }),
        // Returns an ArrayBuffer, exactly as the real raw-IPC command does —
        // the frontend wraps it in a blob URL without caring where it came from.
        take_capture_image: () => bytes(CAPTURE_BASE64),
        list_system_fonts: () => ["Segoe UI", "Arial", "Georgia", "Consolas"],
        get_shortcuts: () => ({ fullscreen: "Ctrl+Shift+3", area: "Ctrl+Shift+4" }),
        list_history: () =>
          HISTORY.map((thumbnail, i) => ({
            id: "entry-" + i,
            created_at: 0,
            width: 1440,
            height: 900,
            thumbnail_base64: thumbnail,
          })),
        list_capturable_windows: () => [],
      };

      let nextCallbackId = 1;
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: ${JSON.stringify(label)} } },
        transformCallback: (callback) => {
          const id = nextCallbackId++;
          window["_" + id] = callback;
          return id;
        },
        invoke: async (cmd) => {
          const handler = HANDLERS[cmd];
          // Unknown commands resolve rather than reject: most are fire-and-
          // forget signals (editor_ready, overlay_ready) whose only job is to
          // tell Rust to reveal a window that, here, is already on screen.
          return handler ? handler() : null;
        },
      };
    })();
  `;
}
