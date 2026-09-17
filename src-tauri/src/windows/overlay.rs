use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

const OVERLAY_LABEL: &str = "overlay";

/// Opens a transparent, always-on-top, borderless window spanning the full
/// virtual desktop (all monitors) so the user can drag out a region or hover
/// a window to select it. Reuses an existing overlay window if one is open.
pub fn open_capture_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(OVERLAY_LABEL) {
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let (min_x, min_y, max_x, max_y) = monitors.iter().fold(
        (i32::MAX, i32::MAX, i32::MIN, i32::MIN),
        |(min_x, min_y, max_x, max_y), m| {
            let pos = m.position();
            let size = m.size();
            (
                min_x.min(pos.x),
                min_y.min(pos.y),
                max_x.max(pos.x + size.width as i32),
                max_y.max(pos.y + size.height as i32),
            )
        },
    );

    let scale = monitors.first().map(|m| m.scale_factor()).unwrap_or(1.0);

    let window = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("index.html".into()))
        .title("shota-overlay")
        .transparent(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    window
        .set_position(LogicalPosition::new(min_x as f64 / scale, min_y as f64 / scale))
        .map_err(|e| e.to_string())?;
    window
        .set_size(LogicalSize::new(
            (max_x - min_x) as f64 / scale,
            (max_y - min_y) as f64 / scale,
        ))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

pub fn close_capture_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
