use tauri::{AppHandle, Manager};

use super::{chromeless_window_builder, place_chromeless_window};

const HISTORY_LABEL: &str = "history";
const BAR_HEIGHT: f64 = 150.0;
const WIDTH_FRACTION: f64 = 0.8;
const BOTTOM_MARGIN: f64 = 14.0;

/// Opens the history carousel if it isn't already open, or closes it if it
/// is — Ctrl+Shift+6 toggles the same way the capture area shortcut toggles
/// window-snap mode.
pub fn toggle_history_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(HISTORY_LABEL).is_some() {
        return close_history_window(app);
    }
    open_history_window(app)
}

/// Opens a transparent, always-on-top, borderless strip sized to 80% of the
/// primary monitor's work area (i.e. excluding the taskbar), centered
/// horizontally and sitting just above the taskbar.
pub fn open_history_window(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(HISTORY_LABEL) {
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let monitor = app
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no primary monitor")?;
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    let work_x = work.position.x as f64 / scale;
    let work_y = work.position.y as f64 / scale;
    let work_w = work.size.width as f64 / scale;
    let work_h = work.size.height as f64 / scale;

    let width = work_w * WIDTH_FRACTION;
    let x = work_x + (work_w - width) / 2.0;
    let y = work_y + work_h - BAR_HEIGHT - BOTTOM_MARGIN;

    let window = chromeless_window_builder(app, HISTORY_LABEL, "shota-history")
        .build()
        .map_err(|e| e.to_string())?;

    // Shares the overlay's preset, which also means it now gets the two DWM
    // tweaks the overlay had and this window was missing: no open-fade (it's
    // a borderless transparent strip, so the fade read as a flash) and
    // excluded from screen capture, so an open history bar can't end up
    // baked into a screenshot taken while it's on screen.
    place_chromeless_window(&window, x, y, width, BAR_HEIGHT)?;
    Ok(())
}

pub fn show_history_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(HISTORY_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn close_history_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(HISTORY_LABEL) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
