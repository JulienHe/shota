use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::cloak_window;

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
    let window = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("index.html".into()))
        .title("shota-overlay")
        .transparent(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        // Must be visible to actually load: WebView2 appears to defer
        // loading/running the page entirely while a window is invisible, so
        // `.visible(false)` here deadlocks rather than just occasionally
        // flashing. Cloaked immediately after creation instead (see
        // `prewarm_capture_overlay`) so nothing is ever actually seen.
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;

    window.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;

    exclude_from_capture(&window);
    disable_show_animation(&window);

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

/// Marks the overlay window as excluded from screen capture at the DWM
/// compositor level (`WDA_EXCLUDEFROMCAPTURE`, Windows 10 2004+), so its
/// selection-rectangle chrome can never end up baked into a screenshot no
/// matter how capture and hide/close are timed relative to each other. The
/// existing hide-then-sleep-then-capture dance in `finish_region_capture` /
/// `finish_window_capture` was a race — DWM doesn't necessarily finish
/// un-compositing a hidden always-on-top layered window within a fixed
/// delay, which is why the overlay's border would occasionally still show up
/// in the captured pixels. This makes that race impossible instead of just
/// less likely, so that hide/sleep step is kept only as a cheap extra safety
/// net (e.g. in case this call silently fails on an older Windows build).
#[cfg(windows)]
fn exclude_from_capture(window: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE};

    if let Ok(hwnd) = window.hwnd() {
        // Best-effort: if this fails (e.g. pre-2004 Windows), the hide+sleep
        // fallback in the capture commands still applies.
        let _ = unsafe { SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) };
    }
}

#[cfg(not(windows))]
fn exclude_from_capture(_window: &tauri::WebviewWindow) {}

/// Turns off DWM's default open/close window transition (a brief fade) for
/// the overlay. It's borderless, transparent, and covers the whole virtual
/// desktop, so that fade reads as a stray animated flash over the screen
/// rather than a normal window appearing — the overlay should just be there
/// instantly, with no chrome of its own beyond the hint text the page draws.
#[cfg(windows)]
fn disable_show_animation(window: &tauri::WebviewWindow) {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};

    if let Ok(hwnd) = window.hwnd() {
        // The Win32 BOOL this attribute expects is a plain 4-byte int, not the
        // `windows` crate's own wrapper type (avoids depending on exactly
        // where that type lives across crate versions).
        let disable: i32 = 1;
        let _ = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_TRANSITIONS_FORCEDISABLED,
                &disable as *const i32 as *const core::ffi::c_void,
                std::mem::size_of::<i32>() as u32,
            )
        };
    }
}

#[cfg(not(windows))]
fn disable_show_animation(_window: &tauri::WebviewWindow) {}

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
