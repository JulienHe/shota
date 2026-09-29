use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindow};

use super::{chromeless_window_builder, cloak_window, place_chromeless_window};

const OVERLAY_LABEL: &str = "overlay";
// Far enough off any real monitor that it can never be glimpsed, used only
// while the pre-warmed window is loading (see `prewarm_capture_overlay`).
const OFFSCREEN_POS: f64 = -32000.0;

fn virtual_desktop_bounds(app: &AppHandle) -> Result<(f64, f64, f64, f64), String> {
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
    Ok((
        min_x as f64 / scale,
        min_y as f64 / scale,
        (max_x - min_x) as f64 / scale,
        (max_y - min_y) as f64 / scale,
    ))
}

fn build_overlay_window(app: &AppHandle, x: f64, y: f64, width: f64, height: f64) -> Result<WebviewWindow, String> {
    let window = chromeless_window_builder(app, OVERLAY_LABEL, "shota-overlay")
        .build()
        .map_err(|e| e.to_string())?;

    place_chromeless_window(&window, x, y, width, height)?;
    Ok(window)
}

/// Opens a transparent, always-on-top, borderless window spanning the full
/// virtual desktop (all monitors) so the user can drag out a region or hover
/// a window to select it. Reuses an existing overlay window if one is open —
/// it's cloaked (not destroyed) after every capture specifically so it can
/// be revealed here instantly, already loaded and styled, instead of
/// recreating it (and re-triggering a white flash) on every single capture.
pub fn open_capture_overlay(app: &AppHandle) -> Result<(), String> {
    let (x, y, width, height) = virtual_desktop_bounds(app)?;

    if let Some(existing) = app.get_webview_window(OVERLAY_LABEL) {
        // The pre-warmed window (or one left over from a prior capture) may
        // still be positioned/sized for a stale monitor layout — put it back
        // over the real bounds every time, not just on first creation.
        existing
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        existing
            .set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        cloak_window(&existing, false);
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    build_overlay_window(app, x, y, width, height)?;
    Ok(())
}

/// Creates the overlay window ahead of time, cloaked, so its page has
/// already loaded and applied its transparent styling by the time the user
/// actually presses the capture shortcut — otherwise the very first capture
/// of the session has to load the page from scratch and briefly flashes
/// WebView2's opaque default background.
///
/// Cloaking immediately after creation (rather than the old approach of
/// building off-screen, waiting a fixed delay, then calling `.hide()`) has
/// no race to get wrong: there's no window of time where a real capture
/// could beat a timer to the window and get yanked away mid-use, because
/// nothing here is time-based at all. `open_capture_overlay` uncloaks it
/// like any other reuse. Still built off-screen at a tiny size as a second,
/// independent layer of invisibility in case cloaking ever fails outright
/// (e.g. a pre-2004 Windows build, where `DwmSetWindowAttribute` for
/// `DWMWA_CLOAK` is a no-op) — `open_capture_overlay` already resets both
/// position and size before ever using it for real.
pub fn prewarm_capture_overlay(app: &AppHandle) {
    let window = match build_overlay_window(app, OFFSCREEN_POS, OFFSCREEN_POS, 1.0, 1.0) {
        Ok(w) => w,
        Err(err) => {
            eprintln!("failed to pre-warm capture overlay: {err}");
            return;
        }
    };
    cloak_window(&window, true);
}

/// Called once the overlay page has applied its transparent styling, so the
/// window only becomes visible after it can no longer flash white. Only
/// fires on the very first mount (the JS effect that calls this never runs
/// again once the window is being reused, since React never remounts) —
/// `open_capture_overlay` handles every later reveal directly.
pub fn show_capture_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        cloak_window(&window, false);
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Cloaks (without destroying) the overlay window so its selection-rectangle
/// chrome isn't still on screen when the actual pixels get captured, and so
/// it's ready to be revealed instantly (already loaded and styled) next time
/// instead of being recreated from scratch.
pub fn hide_capture_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        cloak_window(&window, true);
    }
    Ok(())
}
