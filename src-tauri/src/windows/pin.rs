//! Pinned screenshots: a picture kept on screen, above everything else.
//!
//! Each pin is a window of its own, borderless and always on top, showing one
//! image at its real size. They are real windows (destroyed on close), unlike
//! the overlay and editor, which are hidden and reused: a pin is made and
//! thrown away as often as the user likes, and nothing needs to be warm.

use std::io::Cursor;
use std::sync::Arc;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::state::AppState;

use super::{disable_show_animation, place_client_area};

/// The label of the window showing pin `id`. The page reads the id back out
/// of it.
pub fn pin_label(id: u64) -> String {
    format!("pin-{id}")
}

/// The id in a pin window's label, if it is one.
pub fn pin_id(label: &str) -> Option<u64> {
    label.strip_prefix("pin-")?.parse().ok()
}

/// Pins `png` with its top-left at (x, y) in desktop (physical) pixels, so a
/// pinned selection appears exactly over the pixels it was taken from.
pub fn open_pin(app: &AppHandle, png: Vec<u8>, x: i32, y: i32) -> Result<u64, String> {
    let (width, height) = png_size(&png)?;
    let id = app.state::<AppState>().add_pin(Arc::new(png));

    let window = WebviewWindowBuilder::new(app, pin_label(id), WebviewUrl::App("index.html".into()))
        .title("shota-pin")
        .transparent(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .build()
        .map_err(|e| {
            app.state::<AppState>().remove_pin(id);
            e.to_string()
        })?;

    disable_show_animation(&window);
    place_client_area(&window, x, y, width, height)?;
    Ok(id)
}

/// Pins `png` in the middle of the monitor the cursor is on: for an image that
/// did not come from a place on the screen (the editor's current picture).
pub fn open_pin_centred(app: &AppHandle, png: Vec<u8>) -> Result<u64, String> {
    let (width, height) = png_size(&png)?;
    let monitor = match app.cursor_position().ok().and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten()) {
        Some(monitor) => monitor,
        None => app
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no monitor found".to_string())?,
    };
    let position = monitor.position();
    let size = monitor.size();
    // A picture bigger than the screen still gets its top-left on the screen.
    let x = position.x + (size.width.saturating_sub(width) / 2) as i32;
    let y = position.y + (size.height.saturating_sub(height) / 2) as i32;
    open_pin(app, png, x, y)
}

/// Width and height from the PNG header, without decoding the picture.
fn png_size(png: &[u8]) -> Result<(u32, u32), String> {
    image::ImageReader::new(Cursor::new(png))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .into_dimensions()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_labels_round_trip() {
        assert_eq!(pin_id(&pin_label(7)), Some(7));
        assert_eq!(pin_id("editor"), None);
        assert_eq!(pin_id("pin-x"), None);
    }

    #[test]
    fn size_is_read_from_the_header() {
        let png = crate::capture::encode_png(image::RgbaImage::new(30, 20)).unwrap();
        assert_eq!(png_size(&png).unwrap(), (30, 20));
        assert!(png_size(b"not a png").is_err());
    }
}
