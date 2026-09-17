use base64::Engine;
use tauri::image::Image;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Decodes a base64 PNG and writes it to the system clipboard as an image (Ctrl+C).
pub fn copy_image_to_clipboard(app: &AppHandle, png_base64: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;

    let decoded = image::load_from_memory(&bytes)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let (width, height) = (decoded.width(), decoded.height());

    let image = Image::new_owned(decoded.into_raw(), width, height);
    app.clipboard().write_image(&image).map_err(|e| e.to_string())
}
