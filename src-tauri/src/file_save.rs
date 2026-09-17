use base64::Engine;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::state::AppState;

/// Opens a native "Save As" dialog defaulting to the last folder the user saved
/// to, falling back to the Desktop, then writes the given base64 PNG there.
pub fn save_image(app: &AppHandle, png_base64: &str, suggested_name: &str) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();

    let default_dir = state
        .last_save_dir()
        .or_else(|| {
            app.path()
                .desktop_dir()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        });

    let mut builder = app.dialog().file().set_file_name(suggested_name);
    if let Some(dir) = &default_dir {
        builder = builder.set_directory(dir);
    }

    let picked = builder
        .add_filter("PNG Image", &["png"])
        .blocking_save_file();

    let Some(path) = picked else {
        return Ok(None);
    };

    let path = path.into_path().map_err(|e| e.to_string())?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    if let Some(parent) = path.parent() {
        state.set_last_save_dir(app, parent.to_string_lossy().to_string());
    }

    Ok(Some(path.to_string_lossy().to_string()))
}
