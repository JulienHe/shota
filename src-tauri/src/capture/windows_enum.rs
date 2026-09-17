use serde::Serialize;
use xcap::Window;

#[derive(Serialize, Clone)]
pub struct WindowInfo {
    pub id: u32,
    pub title: String,
    pub app_name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Lists visible, non-minimized windows so the capture overlay can offer
/// "snap to window" selection when the user presses Space.
pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    let windows = Window::all().map_err(|e| e.to_string())?;

    Ok(windows
        .into_iter()
        .filter(|w| !w.is_minimized() && w.width() > 0 && w.height() > 0 && !w.title().is_empty())
        .map(|w| WindowInfo {
            id: w.id(),
            title: w.title().to_string(),
            app_name: w.app_name().to_string(),
            x: w.x(),
            y: w.y(),
            width: w.width(),
            height: w.height(),
        })
        .collect())
}

pub fn capture_window(window_id: u32) -> Result<String, String> {
    let windows = Window::all().map_err(|e| e.to_string())?;

    let window = windows
        .into_iter()
        .find(|w| w.id() == window_id)
        .ok_or_else(|| format!("Window {window_id} not found"))?;

    let image = window.capture_image().map_err(|e| e.to_string())?;
    super::encode_png_base64(image)
}
