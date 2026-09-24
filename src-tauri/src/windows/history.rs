use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

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

    let window = WebviewWindowBuilder::new(app, HISTORY_LABEL, WebviewUrl::App("index.html".into()))
        .title("shota-history")
        .transparent(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        // Visible immediately — the equivalent "hidden until frontend
        // signals ready" pattern used for the capture overlay turned out to
        // deadlock (WebView2 appears to defer loading the page at all while
        // a window is invisible), so it isn't safe to rely on here either.
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;

    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(LogicalSize::new(width, BAR_HEIGHT))
        .map_err(|e| e.to_string())?;

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
