//! The dim-everything-but-the-area backdrop shown during a scrolling capture.
//!
//! One transparent window over the monitor, click-through (the mouse and the
//! wheel reach the content underneath) and excluded from capture, so the
//! pictures never show the dimming.

use tauri::{AppHandle, Manager};

use super::{disable_show_animation, exclude_from_capture, monitor_under_region, place_client_area, scroll_window_builder};

pub const FRAME_LABEL: &str = "scroll-frame";

/// Builds the backdrop for `region` (x, y, width, height in desktop pixels).
/// Runs on the main thread.
pub fn build_scroll_frame(app: &AppHandle, region: (i32, i32, u32, u32)) -> Result<(), String> {
    if app.get_webview_window(FRAME_LABEL).is_some() {
        return Ok(());
    }
    let (rx, ry, rw, rh) = region;
    let monitor = monitor_under_region(app, region)?;
    let position = monitor.position();
    let size = monitor.size();
    let url = format!("index.html?r={},{},{},{}", rx - position.x, ry - position.y, rw, rh);

    let window = scroll_window_builder(app, FRAME_LABEL, url, "shota-scroll-frame")
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
