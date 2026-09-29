use base64::Engine;
use tauri::image::Image;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Decodes a base64 PNG and writes it to the system clipboard as an image (Ctrl+C).
pub fn copy_image_to_clipboard(app: &AppHandle, png_base64: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;

    copy_png_bytes(app, &bytes)
}

/// Writes already-decoded PNG bytes to the clipboard.
///
/// Used by anything that already holds the image on the Rust side (copying
/// straight from history, say), so it doesn't have to base64 a multi-megabyte
/// screenshot, hand it to the webview and take it straight back again.
pub fn copy_png_bytes(app: &AppHandle, bytes: &[u8]) -> Result<(), String> {
    let decoded = image::load_from_memory(bytes)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let (width, height) = (decoded.width(), decoded.height());

    let image = Image::new_owned(decoded.into_raw(), width, height);
    app.clipboard().write_image(&image).map_err(|e| e.to_string())
}
