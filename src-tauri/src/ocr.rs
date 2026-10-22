//! Reading text out of a picture with Windows' own OCR engine
//! (`Windows.Media.Ocr`): free, offline, nothing added to the download, and it
//! reads whichever languages the user already has installed in Windows.

use image::RgbaImage;

/// The text found in `image`, lines separated by newlines. Empty when none was
/// found, which is an answer rather than an error.
///
/// Runs on a thread of its own: the OCR calls are asynchronous WinRT calls that
/// are simplest to wait on from a thread that owns its COM apartment.
pub fn recognize_text(image: RgbaImage) -> Result<String, String> {
    std::thread::spawn(move || imp::recognize(&image))
        .join()
        .map_err(|_| "text recognition crashed".to_string())?
}

#[cfg(windows)]
mod imp {
    use image::RgbaImage;
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    /// Words are read best at ordinary text size. Tiny crops (a few pixels of a
    /// caption) are scaled up first; the engine copes badly below this.
    const MIN_SIDE: u32 = 40;

    pub fn recognize(image: &RgbaImage) -> Result<String, String> {
        let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };

        let engine = OcrEngine::TryCreateFromUserProfileLanguages()
            .map_err(|_| "no text recognition language is installed in Windows".to_string())?;

        let max = OcrEngine::MaxImageDimension().map_err(|e| e.to_string())?;
        let prepared = fit(image, max, MIN_SIDE);
        let (width, height) = prepared.dimensions();

        // The engine wants BGRA; the screen capture is RGBA.
        let mut bgra = prepared.into_raw();
        for pixel in bgra.chunks_exact_mut(4) {
            pixel.swap(0, 2);
        }

        let writer = DataWriter::new().map_err(|e| e.to_string())?;
        writer.WriteBytes(&bgra).map_err(|e| e.to_string())?;
        let buffer = writer.DetachBuffer().map_err(|e| e.to_string())?;
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, width as i32, height as i32)
            .map_err(|e| e.to_string())?;

        let result = engine
            .RecognizeAsync(&bitmap)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        Ok(result.Text().map_err(|e| e.to_string())?.to_string())
    }

    /// Scales `image` so its smaller side is at least `min_side` and its larger
    /// side at most `max_side`.
    pub(super) fn fit(image: &RgbaImage, max_side: u32, min_side: u32) -> RgbaImage {
        let (width, height) = image.dimensions();
        let smaller = width.min(height).max(1);
        let larger = width.max(height).max(1);
        let mut scale = 1.0f64;
        if smaller < min_side {
            scale = min_side as f64 / smaller as f64;
        }
        if (larger as f64 * scale) > max_side as f64 {
            scale = max_side as f64 / larger as f64;
        }
        if (scale - 1.0).abs() < f64::EPSILON {
            return image.clone();
        }
        let new_width = ((width as f64 * scale).round() as u32).max(1);
        let new_height = ((height as f64 * scale).round() as u32).max(1);
        image::imageops::resize(image, new_width, new_height, image::imageops::FilterType::Lanczos3)
    }
}

#[cfg(not(windows))]
mod imp {
    use image::RgbaImage;

    pub fn recognize(_image: &RgbaImage) -> Result<String, String> {
        Err("text recognition is only available on Windows".to_string())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn small_crops_are_scaled_up_and_huge_ones_down() {
        let tiny = RgbaImage::new(20, 10);
        let scaled = imp::fit(&tiny, 10_000, 40);
        assert_eq!(scaled.height(), 40);
        assert_eq!(scaled.width(), 80);

        let wide = RgbaImage::new(20_000, 100);
        let reduced = imp::fit(&wide, 10_000, 40);
        assert_eq!(reduced.width(), 10_000);

        let ordinary = RgbaImage::new(300, 200);
        assert_eq!(imp::fit(&ordinary, 10_000, 40).dimensions(), (300, 200));
    }

    /// Needs a picture of text at %TEMP%\shota-ocr-test.png and an OCR language
    /// installed in Windows, so it only runs when asked for:
    /// `cargo test ocr_reads_a_real_picture -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn ocr_reads_a_real_picture() {
        let path = std::env::temp_dir().join("shota-ocr-test.png");
        let image = image::open(&path).expect("create the test picture first").to_rgba8();
        let text = recognize_text(image).expect("recognition failed");
        println!("recognised: {text:?}");
        assert!(text.to_lowercase().contains("shota"), "got {text:?}");
    }
}
