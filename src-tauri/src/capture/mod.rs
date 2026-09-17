mod monitors;
mod region;
mod windows_enum;

pub use monitors::capture_fullscreen;
pub use region::capture_region;
pub use windows_enum::{capture_window, list_windows, WindowInfo};

use image::{DynamicImage, RgbaImage};

/// Encodes an RGBA image buffer as a base64 PNG data string ready to hand to the frontend.
pub fn encode_png_base64(rgba: RgbaImage) -> Result<String, String> {
    use base64::Engine;
    use std::io::Cursor;

    let dynamic = DynamicImage::ImageRgba8(rgba);
    let mut bytes: Vec<u8> = Vec::new();
    dynamic
        .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}
