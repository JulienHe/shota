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

    // Left hidden here on purpose: WebView2 paints its own opaque white
    // background before our page's JS makes it transparent, so showing the
    // window immediately causes a white flash. The frontend calls the
    // `overlay_ready` command once it has applied the transparent styling,
    // which is what actually shows the window (see show_capture_overlay).

    exclude_from_capture(&window);
    disable_show_animation(&window);

    Ok(())
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
/// window only becomes visible after it can no longer flash white.
pub fn show_capture_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Hides (without destroying) the overlay window so its selection-rectangle
/// chrome isn't still on screen when the actual pixels get captured — call
/// this and give the compositor a moment before capturing, then close for
/// real afterwards.
pub fn hide_capture_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn close_capture_overlay(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
