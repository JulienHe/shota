use base64::Engine;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::state::{AppState, ImageFormat};

/// Opens a native "Save As" dialog and writes the given base64 image there.
///
/// The dialog starts in the folder chosen in settings, or failing that the
/// last folder saved to, or failing that the Desktop. The image arrives
/// already encoded in `format`: the canvas that rendered it can encode PNG,
/// JPEG and WebP itself, so Rust never re-decodes a multi-megabyte image
/// just to change its container.
pub fn save_image(
    app: &AppHandle,
    image_base64: &str,
    suggested_name: &str,
    format: ImageFormat,
) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();

    let default_dir = state
        .preferences()
        .save_dir
        .filter(|dir| std::path::Path::new(dir).is_dir())
        .or_else(|| state.last_save_dir())
        .or_else(|| {
            app.path()
                .desktop_dir()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        });

    let file_name = format!("{}.{}", sanitize_file_name(suggested_name), format.extension());
    let mut builder = app.dialog().file().set_file_name(&file_name);
    if let Some(dir) = &default_dir {
        builder = builder.set_directory(dir);
    }

    let picked = builder
        .add_filter(format.filter_name(), &[format.extension()])
        .blocking_save_file();

    let Some(path) = picked else {
        return Ok(None);
    };

    let path = path.into_path().map_err(|e| e.to_string())?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image_base64)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    if let Some(parent) = path.parent() {
        state.set_last_save_dir(app, parent.to_string_lossy().to_string());
    }

    Ok(Some(path.to_string_lossy().to_string()))
}

/// Strips what Windows refuses in a file name. The pattern is free text
/// typed in settings, so `{date}` producing slashes in some locale, or
/// someone typing a colon, must not turn into a save that fails.
fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '-' } else { c })
        .collect();
    // Windows also rejects trailing dots and spaces.
    let trimmed = cleaned.trim().trim_end_matches(['.', ' ']);
    if trimmed.is_empty() {
        "Shota".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::sanitize_file_name;

    #[test]
    fn strips_characters_windows_rejects() {
        assert_eq!(sanitize_file_name("Shota 2026-10-11 14:05:09"), "Shota 2026-10-11 14-05-09");
        assert_eq!(sanitize_file_name("a/b\\c?"), "a-b-c-");
        assert_eq!(sanitize_file_name("  ... "), "Shota");
        assert_eq!(sanitize_file_name("name. "), "name");
    }
}
