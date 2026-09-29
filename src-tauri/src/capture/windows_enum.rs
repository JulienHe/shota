use serde::Serialize;
use xcap::Window;

#[cfg(windows)]
use windows::Win32::Foundation::{HWND, RECT};
#[cfg(windows)]
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};

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

/// xcap reports each window's *client-area* rect (`GetWindowInfo().rcClient`,
/// which excludes the title bar and border) rather than its full visible
/// bounds — fine for the pixel capture itself, but it left our window-snap
/// highlight sitting inset from the window's actual edges (~10px off on the
/// left, more on top). Re-querying DWM's extended frame bounds ourselves
/// gives the true on-screen rect; `id` is the HWND xcap already handed back
/// (see its own `hwnd.0 as u32`), just reconstructed the other direction.
#[cfg(windows)]
fn full_window_bounds(id: u32) -> Option<(i32, i32, u32, u32)> {
    let hwnd = HWND(id as isize as *mut core::ffi::c_void);
    let mut rect = RECT::default();
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut RECT as *mut core::ffi::c_void,
            std::mem::size_of::<RECT>() as u32,
        )
    };
    if ok.is_err() {
        return None;
    }
    Some((
        rect.left,
        rect.top,
        (rect.right - rect.left).max(0) as u32,
        (rect.bottom - rect.top).max(0) as u32,
    ))
}

#[cfg(not(windows))]
fn full_window_bounds(_id: u32) -> Option<(i32, i32, u32, u32)> {
    None
}

/// Lists visible, non-minimized windows so the capture overlay can offer
/// "snap to window" selection when the user presses Space.
pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    let windows = Window::all().map_err(|e| e.to_string())?;
    // Shota's own windows are never snap targets. This matters most for the
    // capture overlay itself: it is a real, visible (merely cloaked) window
    // spanning the entire virtual desktop, so leaving it in the list means
    // every hover lands on it and "snap to window" highlights the whole
    // screen instead of whatever is underneath. Matched by process id rather
    // than title, so renaming a window can't quietly reintroduce it.
    let own_pid = std::process::id();

    Ok(windows
        .into_iter()
        .filter(|w| {
            w.pid() != own_pid
                && !w.is_minimized()
                && w.width() > 0
                && w.height() > 0
                && !w.title().is_empty()
        })
        .map(|w| {
            let (x, y, width, height) =
                full_window_bounds(w.id()).unwrap_or((w.x(), w.y(), w.width(), w.height()));
            WindowInfo {
                id: w.id(),
                title: w.title().to_string(),
                app_name: w.app_name().to_string(),
                x,
                y,
                width,
                height,
            }
        })
        .collect())
}

pub fn capture_window(window_id: u32) -> Result<Vec<u8>, String> {
    let windows = Window::all().map_err(|e| e.to_string())?;

    let window = windows
        .into_iter()
        .find(|w| w.id() == window_id)
        .ok_or_else(|| format!("Window {window_id} not found"))?;

    let image = window.capture_image().map_err(|e| e.to_string())?;
    super::encode_png(image)
}
