use windows::Win32::Foundation::POINT;
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
use xcap::Monitor;

use super::encode_png;

/// Captures the full contents of a single monitor, identified by its xcap monitor id.
/// Pass `None` to capture the monitor under the mouse cursor: the one the user is
/// working on, which on a multi-monitor setup is often not the primary one. Falls
/// back to the primary monitor if the cursor's position can't be read.
pub fn capture_fullscreen(monitor_id: Option<u32>) -> Result<Vec<u8>, String> {
    let monitor = match monitor_id {
        Some(id) => Monitor::all()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|m| m.id() == id)
            .ok_or_else(|| format!("Monitor {id} not found"))?,
        None => match monitor_under_cursor() {
            Some(monitor) => monitor,
            None => Monitor::all()
                .map_err(|e| e.to_string())?
                .into_iter()
                .find(|m| m.is_primary())
                .ok_or_else(|| "No primary monitor found".to_string())?,
        },
    };

    let image = monitor.capture_image().map_err(|e| e.to_string())?;
    encode_png(image)
}

/// The process is per-monitor DPI aware, so both the cursor position and the
/// monitor lookup are in physical pixels and agree across mixed-DPI setups.
fn monitor_under_cursor() -> Option<Monitor> {
    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point) }.ok()?;
    Monitor::from_point(point.x, point.y).ok()
}
