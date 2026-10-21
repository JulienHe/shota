//! The whole virtual desktop as one image, for the capture overlay to freeze.
//!
//! Every monitor is captured and placed where it sits on the desktop, so a
//! selection that spans two screens is just a crop of one picture. Nothing
//! downstream has to know how many monitors there are.

use image::RgbaImage;
use xcap::Monitor;

/// A snapshot of the virtual desktop. `origin_x`/`origin_y` are the desktop
/// coordinates (physical pixels, can be negative) of the image's top-left.
pub struct Desktop {
    pub origin_x: i32,
    pub origin_y: i32,
    pub image: RgbaImage,
}

impl Desktop {
    /// Crops a region given in desktop coordinates. The region is clamped to
    /// what the snapshot covers; `None` when nothing of it is covered.
    pub fn crop(&self, x: i32, y: i32, width: u32, height: u32) -> Option<RgbaImage> {
        let left = (x - self.origin_x).max(0) as u32;
        let top = (y - self.origin_y).max(0) as u32;
        // `x`/`y` may start before the snapshot; the part before it is lost.
        let lost_x = (self.origin_x - x).max(0) as u32;
        let lost_y = (self.origin_y - y).max(0) as u32;
        let width = width.saturating_sub(lost_x);
        let height = height.saturating_sub(lost_y);
        if left >= self.image.width() || top >= self.image.height() || width == 0 || height == 0 {
            return None;
        }
        let width = width.min(self.image.width() - left);
        let height = height.min(self.image.height() - top);
        Some(image::imageops::crop_imm(&self.image, left, top, width, height).to_image())
    }
}

/// Captures every monitor and stitches them into one desktop image.
pub fn capture_desktop() -> Result<Desktop, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let mut parts = Vec::with_capacity(monitors.len());
    for monitor in &monitors {
        let image = monitor.capture_image().map_err(|e| e.to_string())?;
        parts.push((monitor.x(), monitor.y(), image));
    }
    stitch(parts).ok_or_else(|| "no monitors to capture".to_string())
}

/// Places each `(x, y, image)` at its desktop position on one canvas just big
/// enough to hold them all. Gaps between monitors (a smaller screen beside a
/// taller one) stay transparent black.
pub fn stitch(parts: Vec<(i32, i32, RgbaImage)>) -> Option<Desktop> {
    let min_x = parts.iter().map(|(x, _, _)| *x).min()?;
    let min_y = parts.iter().map(|(_, y, _)| *y).min()?;
    let max_x = parts.iter().map(|(x, _, img)| *x + img.width() as i32).max()?;
    let max_y = parts.iter().map(|(_, y, img)| *y + img.height() as i32).max()?;

    // The common case (one monitor) is that monitor's own image: no copy.
    if parts.len() == 1 {
        let (x, y, image) = parts.into_iter().next()?;
        return Some(Desktop { origin_x: x, origin_y: y, image });
    }

    let mut canvas = RgbaImage::new((max_x - min_x) as u32, (max_y - min_y) as u32);
    for (x, y, image) in &parts {
        image::imageops::replace(&mut canvas, image, (*x - min_x) as i64, (*y - min_y) as i64);
    }
    Some(Desktop { origin_x: min_x, origin_y: min_y, image: canvas })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn solid(width: u32, height: u32, color: [u8; 4]) -> RgbaImage {
        RgbaImage::from_pixel(width, height, Rgba(color))
    }

    #[test]
    fn one_monitor_is_returned_as_is() {
        let desktop = stitch(vec![(0, 0, solid(4, 3, [9, 9, 9, 255]))]).unwrap();
        assert_eq!((desktop.origin_x, desktop.origin_y), (0, 0));
        assert_eq!(desktop.image.dimensions(), (4, 3));
    }

    #[test]
    fn side_by_side_monitors_share_one_canvas() {
        let desktop = stitch(vec![
            (0, 0, solid(4, 3, [255, 0, 0, 255])),
            (4, 0, solid(2, 3, [0, 255, 0, 255])),
        ])
        .unwrap();
        assert_eq!(desktop.image.dimensions(), (6, 3));
        assert_eq!(desktop.image.get_pixel(3, 1).0, [255, 0, 0, 255]);
        assert_eq!(desktop.image.get_pixel(4, 1).0, [0, 255, 0, 255]);
    }

    #[test]
    fn a_monitor_left_of_and_above_the_primary_gives_a_negative_origin() {
        // Typical: a second screen to the left, its top higher than the primary's.
        let desktop = stitch(vec![
            (0, 0, solid(4, 4, [255, 0, 0, 255])),
            (-3, -2, solid(3, 4, [0, 0, 255, 255])),
        ])
        .unwrap();
        assert_eq!((desktop.origin_x, desktop.origin_y), (-3, -2));
        assert_eq!(desktop.image.dimensions(), (7, 6));
        // Primary's top-left is at canvas (3, 2).
        assert_eq!(desktop.image.get_pixel(3, 2).0, [255, 0, 0, 255]);
        assert_eq!(desktop.image.get_pixel(0, 0).0, [0, 0, 255, 255]);
    }

    #[test]
    fn uneven_heights_leave_a_transparent_gap() {
        let desktop = stitch(vec![
            (0, 0, solid(2, 4, [255, 0, 0, 255])),
            (2, 0, solid(2, 2, [0, 255, 0, 255])),
        ])
        .unwrap();
        assert_eq!(desktop.image.get_pixel(3, 3).0, [0, 0, 0, 0]);
    }

    #[test]
    fn a_selection_across_two_monitors_is_one_crop() {
        let desktop = stitch(vec![
            (0, 0, solid(4, 3, [255, 0, 0, 255])),
            (4, 0, solid(4, 3, [0, 255, 0, 255])),
        ])
        .unwrap();
        let crop = desktop.crop(2, 1, 4, 2).unwrap();
        assert_eq!(crop.dimensions(), (4, 2));
        assert_eq!(crop.get_pixel(1, 0).0, [255, 0, 0, 255]);
        assert_eq!(crop.get_pixel(2, 0).0, [0, 255, 0, 255]);
    }

    #[test]
    fn crop_uses_desktop_coordinates_with_a_negative_origin() {
        let desktop = stitch(vec![
            (0, 0, solid(4, 4, [255, 0, 0, 255])),
            (-4, 0, solid(4, 4, [0, 0, 255, 255])),
        ])
        .unwrap();
        let crop = desktop.crop(-2, 0, 4, 1).unwrap();
        assert_eq!(crop.get_pixel(0, 0).0, [0, 0, 255, 255]);
        assert_eq!(crop.get_pixel(3, 0).0, [255, 0, 0, 255]);
    }

    #[test]
    fn crop_is_clamped_to_the_snapshot() {
        let desktop = stitch(vec![(0, 0, solid(4, 4, [1, 2, 3, 255]))]).unwrap();
        // Hangs off the right and bottom edges.
        assert_eq!(desktop.crop(2, 2, 10, 10).unwrap().dimensions(), (2, 2));
        // Starts before the left edge: the part before it is lost.
        assert_eq!(desktop.crop(-1, 0, 3, 2).unwrap().dimensions(), (2, 2));
        // Entirely outside.
        assert!(desktop.crop(10, 10, 2, 2).is_none());
    }
}
