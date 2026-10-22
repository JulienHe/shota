//! Finding and reading a QR code in a picture.

use image::{imageops, RgbaImage};

/// The text of the first QR code found in `image`, if there is one.
///
/// A code too small on screen to read (a few modules per pixel) fails to
/// decode, so a second try is made at double size before giving up.
pub fn decode_qr(image: &RgbaImage) -> Option<String> {
    read(image).or_else(|| {
        let (width, height) = image.dimensions();
        if width.max(height) > 2000 {
            return None;
        }
        let larger = imageops::resize(image, width * 2, height * 2, imageops::FilterType::CatmullRom);
        read(&larger)
    })
}

fn read(image: &RgbaImage) -> Option<String> {
    let (width, height) = image.dimensions();
    let grey = imageops::grayscale(image);
    let mut prepared = rqrr::PreparedImage::prepare_from_greyscale(width as usize, height as usize, |x, y| {
        grey.get_pixel(x as u32, y as u32).0[0]
    });
    prepared
        .detect_grids()
        .into_iter()
        .find_map(|grid| grid.decode().ok().map(|(_, content)| content))
        .filter(|content| !content.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;
    use qrcode::{Color, QrCode};

    /// Draws `text` as a QR code on white, `scale` pixels per module, with the
    /// quiet zone a scanner needs.
    fn render(text: &str, scale: u32) -> RgbaImage {
        let code = QrCode::new(text.as_bytes()).unwrap();
        let modules = code.width() as u32;
        let quiet = 4;
        let side = (modules + quiet * 2) * scale;
        let mut image = RgbaImage::from_pixel(side, side, Rgba([255, 255, 255, 255]));
        for (index, color) in code.to_colors().into_iter().enumerate() {
            if color == Color::Dark {
                let (mx, my) = (index as u32 % modules, index as u32 / modules);
                for dy in 0..scale {
                    for dx in 0..scale {
                        image.put_pixel((mx + quiet) * scale + dx, (my + quiet) * scale + dy, Rgba([0, 0, 0, 255]));
                    }
                }
            }
        }
        image
    }

    #[test]
    fn reads_a_code_it_is_given() {
        let image = render("https://example.com/shota?x=1", 6);
        assert_eq!(decode_qr(&image).as_deref(), Some("https://example.com/shota?x=1"));
    }

    #[test]
    fn reads_a_code_on_a_busy_screen() {
        // The code sits inside a larger picture, as it does in a real selection.
        let code = render("hello", 5);
        let mut canvas = RgbaImage::from_pixel(code.width() + 80, code.height() + 60, Rgba([200, 220, 240, 255]));
        imageops::overlay(&mut canvas, &code, 40, 30);
        assert_eq!(decode_qr(&canvas).as_deref(), Some("hello"));
    }

    #[test]
    fn a_small_code_is_read_after_scaling_up() {
        let image = render("tiny", 2);
        assert_eq!(decode_qr(&image).as_deref(), Some("tiny"));
    }

    #[test]
    fn a_picture_without_a_code_gives_nothing() {
        let blank = RgbaImage::from_pixel(120, 120, Rgba([255, 255, 255, 255]));
        assert_eq!(decode_qr(&blank), None);
    }
}
