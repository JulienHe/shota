//! The small panel shown while a scrolling capture runs: how far it has got,
//! and buttons to finish or cancel.
//!
//! It is kept out of the screenshots (excluded from capture at the compositor)
//! and placed away from the area being captured, so it can sit on screen the
//! whole time without ending up in the picture.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::{disable_show_animation, exclude_from_capture, place_client_area};

pub const HUD_LABEL: &str = "scroll-hud";

/// Logical size of the panel.
const WIDTH: f64 = 540.0;
const HEIGHT: f64 = 84.0;
/// Gap between the panel and the edge of the screen.
const MARGIN: f64 = 28.0;

/// Shows the panel for a capture of `region` (x, y, width, height in desktop pixels).
pub fn open_scroll_hud(app: &AppHandle, region: (i32, i32, u32, u32)) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(err) = build(&handle, region) {
            eprintln!("could not show the scrolling capture panel: {err}");
        }
    });
}

pub fn close_scroll_hud(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window(HUD_LABEL) {
            let _ = window.destroy();
        }
    });
}

fn build(app: &AppHandle, region: (i32, i32, u32, u32)) -> Result<(), String> {
    if app.get_webview_window(HUD_LABEL).is_some() {
        return Ok(());
    }
    let (rx, ry, rw, rh) = region;
    let centre = (rx + (rw / 2) as i32, ry + (rh / 2) as i32);
    let monitor = app
        .monitor_from_point(centre.0 as f64, centre.1 as f64)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "no monitor found".to_string())?;

    let scale = monitor.scale_factor();
    let width = (WIDTH * scale).round() as u32;
    let height = (HEIGHT * scale).round() as u32;
    let margin = (MARGIN * scale).round() as i32;
    let position = monitor.position();
    let size = monitor.size();

    let x = position.x + (size.width.saturating_sub(width) / 2) as i32;
    // Top of the screen, unless the area being captured is up there.
    let top = position.y + margin;
    let y = if ry < top + height as i32 + margin {
        position.y + size.height as i32 - height as i32 - margin * 2
    } else {
        top
    };

    let window = WebviewWindowBuilder::new(app, HUD_LABEL, WebviewUrl::App("index.html".into()))
        .title("shota-scroll")
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
    place_client_area(&window, x, y, width, height)
}
