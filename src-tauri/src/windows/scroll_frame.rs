//! The dim-everything-but-the-area backdrop shown during a scrolling capture.
//!
//! One transparent window over the monitor, click-through (the mouse and the
//! wheel reach the content underneath) and excluded from capture, so the
//! pictures never show the dimming.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::{disable_show_animation, exclude_from_capture, place_client_area};

pub const FRAME_LABEL: &str = "scroll-frame";

/// Builds the backdrop for `region` (x, y, width, height in desktop pixels).
/// Runs on the main thread.
pub fn build_scroll_frame(app: &AppHandle, region: (i32, i32, u32, u32)) -> Result<(), String> {
    if app.get_webview_window(FRAME_LABEL).is_some() {
        return Ok(());
    }
    let (rx, ry, rw, rh) = region;
    let monitor = app
        .monitor_from_point((rx + (rw / 2) as i32) as f64, (ry + (rh / 2) as i32) as f64)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "no monitor found".to_string())?;
    let position = monitor.position();
    let size = monitor.size();
    let url = format!("index.html?r={},{},{},{}", rx - position.x, ry - position.y, rw, rh);

    let window = WebviewWindowBuilder::new(app, FRAME_LABEL, WebviewUrl::App(url.into()))
        .title("shota-scroll-frame")
        .transparent(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;

    disable_show_animation(&window);
    exclude_from_capture(&window);
    let _ = window.set_ignore_cursor_events(true);
    place_client_area(&window, position.x, position.y, size.width, size.height)
}

pub fn close_scroll_frame(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(FRAME_LABEL) {
        let _ = window.destroy();
    }
}
