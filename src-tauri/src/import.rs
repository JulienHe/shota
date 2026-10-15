//! Opening an image that wasn't captured: a file picked from the tray or
//! dropped on the editor, or whatever image is on the clipboard.
//!
//! Everything ends in `open_editor_with_history`, the same path a capture
//! takes, so an opened image gets a history entry and behaves exactly like a
//! screenshot from there on.

use std::path::{Path, PathBuf};

use image::RgbaImage;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::capture::encode_png;
use crate::i18n;
use crate::state::AppState;
use crate::windows::open_editor_with_history;

/// What the picker offers and what a drop accepts. Every one of these is
/// decoded by the `image` crate's default features.
pub const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff", "ico"];

/// Far past any real screenshot. Reading the file whole is the point, but a
/// dropped multi-gigabyte file shouldn't be allowed to try.
const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

pub fn is_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| IMAGE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Reads an image file and opens it in the editor. Slow for a large JPEG
/// (decode, then encode as PNG), so callers run it off the main thread.
pub fn open_file(app: &AppHandle, path: &Path) -> Result<(), String> {
    if !is_image_path(path) {
        return Err("not an image".to_string());
    }
    let size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
    if size > MAX_FILE_BYTES {
        return Err("file too large".to_string());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    open_editor_with_history(app, to_png(bytes)?)
}

/// Opens the clipboard's image in the editor. `Ok(false)` when there isn't
/// one, which is an answer for the user rather than an error.
pub fn open_clipboard(app: &AppHandle) -> Result<bool, String> {
    let Ok(image) = app.clipboard().read_image() else {
        return Ok(false);
    };
    let rgba = RgbaImage::from_raw(image.width(), image.height(), image.rgba().to_vec())
        .ok_or_else(|| "clipboard image has the wrong size".to_string())?;
    open_editor_with_history(app, encode_png(rgba)?)?;
    Ok(true)
}

/// The editor and history both take PNG. A PNG passes through untouched
/// (no decode, no quality change); anything else is converted once here.
fn to_png(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    if bytes.starts_with(PNG_SIGNATURE) {
        return Ok(bytes);
    }
    let decoded = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    encode_png(decoded.to_rgba8())
}

/// The tray's "Open Image…": a native file picker, then the editor.
pub fn pick_and_open(app: &AppHandle) {
    let locale = app.state::<AppState>().locale();
    let handle = app.clone();
    app.dialog()
        .file()
        .set_title(i18n::t(&locale, "import.dialogTitle"))
        .add_filter(i18n::t(&locale, "import.filterName"), IMAGE_EXTENSIONS)
        .pick_file(move |picked| {
            let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
                return;
            };
            open_file_or_report(&handle, path);
        });
}

/// The tray's "Open from Clipboard".
pub fn open_clipboard_or_report(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || match open_clipboard(&handle) {
        Ok(true) => {}
        Ok(false) => report(&handle, "import.noClipboardImage"),
        Err(err) => {
            eprintln!("opening the clipboard image failed: {err}");
            report(&handle, "import.failed");
        }
    });
}

/// For callers with no window of their own to show an error in (the tray,
/// a second launch from Explorer): failures get a native message box.
pub fn open_file_or_report(app: &AppHandle, path: PathBuf) {
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Err(err) = open_file(&handle, &path) {
            eprintln!("opening {} failed: {err}", path.display());
            report(&handle, "import.failed");
        }
    });
}

fn report(app: &AppHandle, key: &str) {
    let locale = app.state::<AppState>().locale();
    app.dialog()
        .message(i18n::t(&locale, key))
        .title("Shota")
        .kind(MessageDialogKind::Warning)
        .show(|_| {});
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_image_extensions_in_any_case() {
        assert!(is_image_path(Path::new(r"C:\shots\a.PNG")));
        assert!(is_image_path(Path::new("photo.jpeg")));
        assert!(!is_image_path(Path::new("notes.txt")));
        assert!(!is_image_path(Path::new("png")));
    }

    #[test]
    fn png_passes_through_untouched() {
        let png = encode_png(RgbaImage::new(3, 2)).unwrap();
        assert_eq!(to_png(png.clone()).unwrap(), png);
    }

    #[test]
    fn other_formats_become_png_of_the_same_size() {
        let mut bmp = Vec::new();
        image::DynamicImage::ImageRgba8(RgbaImage::new(5, 4))
            .write_to(&mut std::io::Cursor::new(&mut bmp), image::ImageFormat::Bmp)
            .unwrap();
        let png = to_png(bmp).unwrap();
        assert!(png.starts_with(PNG_SIGNATURE));
        let decoded = image::load_from_memory(&png).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (5, 4));
    }

    #[test]
    fn rejects_bytes_that_are_not_an_image() {
        assert!(to_png(b"definitely not an image".to_vec()).is_err());
    }
}
