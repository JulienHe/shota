//! Images the editor can put behind a screenshot: the user's own desktop
//! wallpaper, or a picture they choose.
//!
//! Both are read here and handed over as raw bytes (an `ipc::Response`,
//! which arrives in JS as an ArrayBuffer) for the same reason captures are:
//! wallpapers are often several megabytes, and base64 in JSON would triple
//! the work for nothing. The editor wraps them in a same-origin blob URL,
//! which keeps the export canvas untainted.

use std::path::Path;

/// Generous for any real photo, and small enough that a mistaken pick of
/// some huge file can't stall the editor.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "gif"];

/// The current desktop wallpaper's file, as Windows reports it.
///
/// Fails for a solid-colour desktop (there is no file) and can fail for a
/// slideshow between images, in which case the editor simply doesn't offer
/// the option.
#[cfg(windows)]
fn wallpaper_path() -> Option<std::path::PathBuf> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
    };

    let mut buf = [0u16; 1024];
    unsafe {
        SystemParametersInfoW(
            SPI_GETDESKWALLPAPER,
            buf.len() as u32,
            Some(buf.as_mut_ptr().cast()),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .ok()?;
    }
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    if len == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buf[..len]).into())
}

#[cfg(not(windows))]
fn wallpaper_path() -> Option<std::path::PathBuf> {
    None
}

fn read_limited(path: &Path) -> Result<Vec<u8>, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_BYTES {
        return Err("not a usable image file".into());
    }
    std::fs::read(path).map_err(|e| e.to_string())
}

pub fn desktop_wallpaper() -> Result<Vec<u8>, String> {
    let path = wallpaper_path().ok_or("no wallpaper image")?;
    read_limited(&path)
}

/// Reads an image the user picked as a background. Limited to image
/// extensions: the path comes from the webview, and this should never be a
/// way to read arbitrary files.
pub fn read_image(path: &str) -> Result<Vec<u8>, String> {
    let path = Path::new(path);
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err("not an image".into());
    }
    read_limited(path)
}
