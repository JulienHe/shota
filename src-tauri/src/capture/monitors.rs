use xcap::Monitor;

use super::encode_png;

/// Captures the full contents of a single monitor, identified by its xcap monitor id.
/// Pass `None` to capture the primary monitor.
pub fn capture_fullscreen(monitor_id: Option<u32>) -> Result<Vec<u8>, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;

    let monitor = match monitor_id {
        Some(id) => monitors
            .into_iter()
            .find(|m| m.id() == id)
            .ok_or_else(|| format!("Monitor {id} not found"))?,
        None => monitors
            .into_iter()
            .find(|m| m.is_primary())
            .ok_or_else(|| "No primary monitor found".to_string())?,
    };

    let image = monitor.capture_image().map_err(|e| e.to_string())?;
    encode_png(image)
}
