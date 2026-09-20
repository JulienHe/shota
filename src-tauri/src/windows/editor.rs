use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::state::AppState;

const EDITOR_LABEL: &str = "editor";

/// Opens (or focuses an existing) editor window and hands it the freshly
/// captured image, either immediately via event or through the pending-image
/// slot if the window is still loading.
pub fn open_editor_window(app: &AppHandle, image_base64: String) -> Result<(), String> {
    app.state::<AppState>().set_pending_image(image_base64.clone());

    if let Some(existing) = app.get_webview_window(EDITOR_LABEL) {
        existing.set_focus().map_err(|e| e.to_string())?;
        existing
            .emit("shota://new-capture", image_base64)
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
