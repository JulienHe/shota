use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use super::cloak_window;
use crate::history;
use crate::state::{AppState, PendingCapture};

const EDITOR_LABEL: &str = "editor";

/// Opens (or focuses an existing) editor window and hands it the freshly
/// captured image, either immediately via event or through the pending-image
/// slot if the window is still loading. Copy/Save/the close button all
/// cloak the editor window rather than destroy it (mirroring the capture
/// overlay's hide-and-reuse), specifically so this reuse path is what
/// normally runs — a typical capture→copy→capture session was otherwise
/// rebuilding the editor's page from scratch on every single capture, not
/// just the first.
pub fn open_editor_window(
    app: &AppHandle,
    image: Arc<Vec<u8>>,
    image_id: String,
    history_id: Option<String>,
    shapes_json: Option<String>,
) -> Result<(), String> {
    let capture = PendingCapture {
        image_id: image_id.clone(),
        history_id,
        shapes_json,
    };
    let state = app.state::<AppState>();
    // The bytes stay here and are fetched separately and raw by the editor
    // (`take_capture_image`) — only this small id travels in the event.
    state.put_capture(image_id, image);
    state.set_pending_capture(capture.clone());

    if let Some(existing) = app.get_webview_window(EDITOR_LABEL) {
        // Stay cloaked (invisible, but still fully "shown"/running as far
        // as Tauri/WebView2 are concerned — see `cloak_window`) until the
        // frontend confirms the new image has actually loaded and painted.
        // Revealing immediately here means the *previous* capture is what's
        // visible for a moment, since decoding the new one is inherently
        // async. `editor_ready` (called once that's done) is what reveals it.
        cloak_window(&existing, true);
        existing
            .emit("shota://new-capture", capture)
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, EDITOR_LABEL, WebviewUrl::App("index.html".into()))
        .title("Shota")
        .inner_size(1100.0, 750.0)
        .min_inner_size(480.0, 360.0)
        // No native title bar — the frontend draws its own (merging the
        // toolbar into the same row as custom minimize/maximize/close
        // buttons), same idea as CleanShot's traffic-light-adjacent toolbar
        // on macOS. The window stays resizable by its edges as normal;
        // that's independent of the title bar itself.
        .decorations(false)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Creates the editor window ahead of time — at its real, final size and
/// position, fully "visible" as far as Tauri/WebView2 are concerned — so
/// its page has already loaded by the time the user actually captures
/// something. `visible(false)` was tried for this instead of cloaking and
/// reliably broke captures: WebView2 defers full initialization until a
/// window is actually shown at least once, so a never-shown window doesn't
/// reliably run its JS at all. Cloaking (see `cloak_window`) sidesteps that
/// — the window is left showing, WebView2 initializes and runs normally,
/// DWM just doesn't composite it on screen — and needs no off-screen
/// position/size trickery, since it never has to move or resize once shown
/// for real. `skip_taskbar` hides its taskbar entry until then too.
pub fn prewarm_editor_window(app: &AppHandle) {
    if app.get_webview_window(EDITOR_LABEL).is_some() {
        return;
    }

    let window = match WebviewWindowBuilder::new(app, EDITOR_LABEL, WebviewUrl::App("index.html".into()))
        .title("Shota")
        .inner_size(1100.0, 750.0)
        .min_inner_size(480.0, 360.0)
        .decorations(false)
        .skip_taskbar(true)
        .build()
    {
        Ok(w) => w,
        Err(err) => {
            eprintln!("failed to pre-warm editor window: {err}");
            return;
        }
    };

    cloak_window(&window, true);
}

/// Opens the editor right away, then saves the capture into history in the
/// background — used by every capture path (fullscreen/area/window), so
/// every capture shows up in the Ctrl+Shift+6 carousel regardless of
/// whether the user ends up saving or copying it.
///
/// The history id is generated up front (cheap — just a timestamp) so the
/// editor can be handed a real id immediately, but decoding the image,
/// generating a thumbnail and writing it all to disk is real work — doing
/// that inline before opening the editor was adding a very noticeable
/// delay to every single capture. It's best-effort besides: a history
/// write failure shouldn't affect the capture the user actually asked for.
pub fn open_editor_with_history(app: &AppHandle, image: Vec<u8>) -> Result<(), String> {
    let history_id = history::new_id();
    let image = Arc::new(image);
    open_editor_window(
        app,
        image.clone(),
        history_id.clone(),
        Some(history_id.clone()),
        None,
    )?;

    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(err) = history::add_entry_with_id(&app, &history_id, &image) {
            eprintln!("failed to save history entry: {err}");
        }
    });

    Ok(())
}

/// Reopens a past capture from history, restoring whatever annotations were
/// saved against it last time.
pub fn open_editor_from_history(app: &AppHandle, id: &str) -> Result<(), String> {
    let entry = history::get_entry(app, id)?;
    open_editor_window(
        app,
        Arc::new(entry.image_bytes),
        id.to_string(),
        Some(id.to_string()),
        entry.shapes_json,
    )
}

/// Called by the frontend on every exit path (Copy, Save, the title bar's
/// close button) instead of `.hide()` — cloaking, not actually hiding,
/// keeps `WS_VISIBLE` true permanently once the window's been shown for
/// real once, which is what makes uncloaking it later a reliable way to
/// bring it back. A real `.hide()` here undoes that (uncloaking a window
/// that's genuinely hidden doesn't make it reappear), which is exactly
/// what broke the second capture in a session after this was introduced.
///
/// Also re-hides the taskbar entry: cloaking only controls on-screen
/// compositing, not the taskbar or Alt+Tab listing, so without this the
/// window stayed in both — visible in Alt+Tab and even selectable there —
/// while being permanently invisible on screen once cloaked, with no way
/// to actually bring it back into view.
pub fn hide_editor_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(EDITOR_LABEL) {
        cloak_window(&window, true);
        window.set_skip_taskbar(true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Called by the frontend once a new capture has actually loaded and
/// painted, revealing the (until now cloaked) editor window — see
/// `open_editor_window`'s reuse branch.
pub fn show_editor_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(EDITOR_LABEL) {
        cloak_window(&window, false);
        // No-op past the very first reveal (already false by then), so
        // it's simplest to just always call it here rather than track
        // whether this is the pre-warmed window's first real use.
        window.set_skip_taskbar(false).map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
