use xcap::Monitor;

use super::encode_png_base64;

/// Captures an arbitrary rectangular region in virtual-screen coordinates by
/// capturing the monitor(s) it overlaps and cropping to the requested bounds.
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<String, String> {
    if width == 0 || height == 0 {
        return Err("Region must have non-zero width and height".to_string());
    }

    let monitors = Monitor::all().map_err(|e| e.to_string())?;

    // Find the monitor whose bounds contain the region's top-left corner.
    let monitor = monitors
        .iter()
        .find(|m| {
            let (mx, my) = (m.x(), m.y());
            let (mw, mh) = (m.width(), m.height());
            x >= mx && y >= my && x < mx + mw as i32 && y < my + mh as i32
        })
        .ok_or_else(|| "Region does not overlap any monitor".to_string())?;

    let full = monitor.capture_image().map_err(|e| e.to_string())?;

    let (mx, my) = (monitor.x(), monitor.y());
    let local_x = (x - mx).max(0) as u32;
    let local_y = (y - my).max(0) as u32;

    let cropped = image::imageops::crop_imm(
        &full,
        local_x.min(full.width().saturating_sub(1)),
        local_y.min(full.height().saturating_sub(1)),
        width.min(full.width().saturating_sub(local_x)),
        height.min(full.height().saturating_sub(local_y)),
    )
    .to_image();

    encode_png_base64(cropped)
}
