mod monitors;
mod region;
mod windows_enum;

pub use monitors::capture_fullscreen;
pub use region::capture_region;
pub use windows_enum::{capture_window, list_windows, WindowInfo};

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ExtendedColorType, ImageEncoder, RgbaImage};

/// Encodes an RGBA image buffer as PNG bytes ready to hand to the frontend.
///
/// Uses fast compression rather than the `image` crate's default (which is
/// tuned for small output size over speed) — this is a screenshot tool, so a
/// capture needs to land in the editor in well under a second, and the
/// resulting file is re-encoded anyway whenever the user actually saves.
///
/// Deliberately stops at raw bytes. These used to be base64'd here, which
/// inflated them by a third and then had to be JSON-escaped into an event,
/// parsed back out as a multi-megabyte JS string and base64-decoded again
/// before the image could even begin decoding. They now cross IPC as raw
/// bytes (see `take_capture_image`) and become a blob URL on the other side.
pub fn encode_png(rgba: RgbaImage) -> Result<Vec<u8>, String> {
    let (width, height) = rgba.dimensions();
    let mut bytes: Vec<u8> = Vec::new();
    PngEncoder::new_with_quality(&mut bytes, CompressionType::Fast, FilterType::NoFilter)
        .write_image(rgba.as_raw(), width, height, ExtendedColorType::Rgba8)
        .map_err(|e| e.to_string())?;

    Ok(bytes)
}
