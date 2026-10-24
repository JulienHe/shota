//! Joining screenshots of scrolling content into one tall picture.
//!
//! Each new frame is the previous one with the content moved up by some
//! amount, plus fresh rows at the bottom. Finding that amount is the whole
//! problem: compare rows of the new frame with rows of the previous one at
//! every possible shift, and take the shift where the most of them agree.
//!
//! Two things make it harder than that. Pages have parts that don't scroll
//! (a header stuck to the top, a bar stuck to the bottom), which agree at
//! shift 0 and nowhere else, so they are found first and left out of the
//! comparison. And blank rows agree at every shift, so only rows with some
//! texture to them are allowed to vote.

use image::RgbaImage;

/// Rows with fewer distinct sampled colours than this are treated as blank:
/// they match at any shift and so say nothing about the shift.
const MIN_TEXTURE: usize = 4;
/// Fewer voting rows than this and the match is not trusted.
const MIN_VOTING_ROWS: usize = 8;
/// The share of voting rows that must agree for a shift to be believed.
const MIN_AGREEMENT: f64 = 0.8;
/// Below this share even a standout shift is not believed.
const MIN_SHARE: f64 = 0.05;
/// How many times better than any other shift the best has to be, when it is
/// under MIN_AGREEMENT.
const STANDS_OUT: f64 = 6.0;
/// Pixels sampled per row are every this-many-th, which is plenty to tell
/// rows apart and keeps a 4K frame cheap.
const SAMPLE_STRIDE: u32 = 3;
/// Each row is also read in this many vertical blocks. A video, a carousel or
/// a live counter changes some blocks while the rest of the row (text,
/// borders, other posts) stays put, so a row agrees when most of the blocks
/// that have anything in them agree, instead of needing every pixel to.
const BLOCKS: usize = 8;
/// The share of a row's non-blank blocks that must be equal for the row to agree.
const BLOCK_AGREEMENT: f64 = 0.6;

/// What a new frame did to the picture.
#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    /// Nothing moved: the content is at its end, or not scrolling.
    NoChange,
    /// The content moved down by some amount; this many new rows were added at
    /// the bottom (none, when it went back over rows already seen).
    Appended(u32),
    /// The content went back up by this many rows, adding that many new rows
    /// at the top (none, when it stayed within what was seen).
    Back(u32, u32),
    /// The frames could not be lined up (a jump too big, a video playing, a
    /// different page). Nothing was added.
    NoMatch,
}

#[derive(Clone)]
struct Rows {
    hashes: Vec<u64>,
    textured: Vec<bool>,
    blocks: Vec<[u64; BLOCKS]>,
    /// Bit n set: block n of the row has something in it.
    filled: Vec<u8>,
}

fn rows_of(frame: &RgbaImage) -> Rows {
    let (width, height) = frame.dimensions();
    let mut hashes = Vec::with_capacity(height as usize);
    let mut textured = Vec::with_capacity(height as usize);
    let mut blocks = Vec::with_capacity(height as usize);
    let mut filled = Vec::with_capacity(height as usize);
    let mut seen: Vec<u32> = Vec::with_capacity(8);
    for y in 0..height {
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        let mut block_hash = [0xcbf2_9ce4_8422_2325u64; BLOCKS];
        let mut block_seen: [Vec<u32>; BLOCKS] = Default::default();
        seen.clear();
        let mut x = 0;
        while x < width {
            let p = frame.get_pixel(x, y).0;
            let value = u32::from_le_bytes([p[0], p[1], p[2], 0]);
            let block = (x as usize * BLOCKS / width as usize).min(BLOCKS - 1);
            // The low bits are dropped: the same content is not always drawn
            // bit for bit the same (gradients, video compression, text smoothing).
            for byte in [p[0] >> 3, p[1] >> 3, p[2] >> 3] {
                hash ^= byte as u64;
                hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
                block_hash[block] ^= byte as u64;
                block_hash[block] = block_hash[block].wrapping_mul(0x0000_0100_0000_01b3);
            }
            if seen.len() < MIN_TEXTURE && !seen.contains(&value) {
                seen.push(value);
            }
            if block_seen[block].len() < MIN_TEXTURE && !block_seen[block].contains(&value) {
                block_seen[block].push(value);
            }
            x += SAMPLE_STRIDE;
        }
        let mut mask = 0u8;
        for (n, colours) in block_seen.iter().enumerate() {
            if colours.len() >= MIN_TEXTURE {
                mask |= 1 << n;
            }
        }
        hashes.push(hash);
        textured.push(seen.len() >= MIN_TEXTURE);
        blocks.push(block_hash);
        filled.push(mask);
    }
    Rows { hashes, textured, blocks, filled }
}

/// Whether old row `old` of `previous` and row `new` of `next` are the same
/// row: None if neither has anything in it (it says nothing), otherwise
/// whether enough of the blocks that do agree.
fn rows_agree(previous: &Rows, old: usize, next: &Rows, new: usize) -> Option<bool> {
    let mask = previous.filled[old] | next.filled[new];
    if mask == 0 {
        return None;
    }
    let total = mask.count_ones() as usize;
    let equal = (0..BLOCKS)
        .filter(|n| mask & (1 << n) != 0 && previous.blocks[old][*n] == next.blocks[new][*n])
        .count();
    Some(equal as f64 >= total as f64 * BLOCK_AGREEMENT)
}

enum Bands {
    Identical,
    AllStatic,
    Live { top: usize, bottom: usize },
}

/// A picture being built from frames of scrolling content.
pub struct Stitcher {
    /// Everything so far, without the footer (see `footer`).
    image: RgbaImage,
    previous: RgbaImage,
    previous_rows: Rows,
    /// The last frame's bottom rows that did not scroll, added once at the end.
    footer: Option<RgbaImage>,
    /// Whether the first frame's footer has been cut off yet.
    trimmed: bool,
    /// Where the previous frame's top row sits in `image`.
    offset: usize,
}

impl Stitcher {
    pub fn new(first: RgbaImage) -> Self {
        let previous_rows = rows_of(&first);
        Self { image: first.clone(), previous: first, previous_rows, footer: None, trimmed: false, offset: 0 }
    }

    /// The last picture that lined up (for diagnosing ones that do not).
    pub fn previous(&self) -> &RgbaImage {
        &self.previous
    }

    /// The picture's height so far, footer excluded.
    pub fn height(&self) -> u32 {
        self.image.height()
    }

    /// Adds `frame`, a view of the same region a little further down.
    pub fn push(&mut self, frame: RgbaImage) -> Step {
        if frame.dimensions() != self.previous.dimensions() {
            return Step::NoMatch;
        }
        let height = frame.height() as usize;
        let rows = rows_of(&frame);

        let (top, bottom) = match self.bands(&rows) {
            Bands::Identical => return Step::NoChange,
            Bands::AllStatic => return Step::NoChange,
            Bands::Live { top, bottom } => (top, bottom),
        };
        let live = top..height - bottom;

        // Nothing moved if the rows still line up where they are: only a video,
        // a carousel or a counter changed.
        if best_shift_from(&self.previous_rows, &rows, 0..height, 0) == Some(0) {
            return Step::NoChange;
        }

        // Which way did the content go? Down the page is the usual case; up
        // is the user scrolling back, which is just as good a view of the page.
        let (shift, up) = if let Some(shift) = best_shift(&self.previous_rows, &rows, live.clone()) {
            (shift, false)
        } else if let Some(shift) = best_shift(&rows, &self.previous_rows, live.clone()) {
            (shift, true)
        } else {
            return Step::NoMatch;
        };

        // The first frame went in whole, footer and all. Now that a footer is
        // known, take it back off: it goes at the very end, once, and the page
        // rows hidden under it arrive in the frames that follow.
        if bottom > 0 && !self.trimmed {
            let kept = self.image.height() - bottom as u32;
            self.image = image::imageops::crop_imm(&self.image, 0, 0, self.image.width(), kept).to_image();
            self.trimmed = true;
        }
        if bottom > 0 {
            self.footer = Some(
                image::imageops::crop_imm(&frame, 0, (height - bottom) as u32, frame.width(), bottom as u32).to_image(),
            );
        }

        let added;
        if up {
            // This view starts `shift` rows higher than the previous one.
            if self.offset >= shift {
                self.offset -= shift;
                added = 0;
            } else {
                // Above everything seen so far: the rows that are new go in
                // under any header, which stays at the very top.
                let new = shift - self.offset;
                let new_rows = image::imageops::crop_imm(&frame, 0, top as u32, frame.width(), new as u32).to_image();
                self.insert(top, &new_rows);
                self.offset = 0;
                added = new;
            }
        } else {
            self.offset += shift;
            // Rows below the picture's end exist only if this view reaches
            // past it; scrolling over rows already seen adds nothing.
            let needed = self.offset + live.end;
            let have = self.image.height() as usize;
            if needed > have {
                let new = needed - have;
                let new_rows =
                    image::imageops::crop_imm(&frame, 0, (live.end - new) as u32, frame.width(), new as u32).to_image();
                self.append(&new_rows);
                added = new;
            } else {
                added = 0;
            }
        }
        self.previous = frame;
        self.previous_rows = rows;
        if up {
            Step::Back(shift as u32, added as u32)
        } else {
            Step::Appended(added as u32)
        }
    }

    /// The parts of `rows` that did not move relative to the previous view.
    fn bands(&self, rows: &Rows) -> Bands {
        let height = rows.hashes.len();
        let identical_from_top = static_band(self.previous_rows.hashes.iter().zip(&rows.hashes));
        if identical_from_top == height {
            return Bands::Identical;
        }
        // Blank rows next to a band are not part of it: they agree at every
        // shift, so a blank stretch at the edge of two frames looks "stuck"
        // when it is only the page's background. Counting it would cut the
        // new rows off short.
        let mut top = identical_from_top;
        while top > 0 && !rows.textured[top - 1] {
            top -= 1;
        }
        let mut bottom = static_band(self.previous_rows.hashes.iter().rev().zip(rows.hashes.iter().rev()));
        while bottom > 0 && !rows.textured[height - bottom] {
            bottom -= 1;
        }
        // A frame that is all static band has nothing left to compare.
        if top + bottom >= height {
            return Bands::AllStatic;
        }
        Bands::Live { top, bottom }
    }

    /// Puts `rows` into the picture at row `at`.
    fn insert(&mut self, at: usize, rows: &RgbaImage) {
        let (width, height) = self.image.dimensions();
        let mut bytes = std::mem::replace(&mut self.image, RgbaImage::new(0, 0)).into_raw();
        let at_byte = at * width as usize * 4;
        bytes.splice(at_byte..at_byte, rows.as_raw().iter().copied());
        self.image = RgbaImage::from_raw(width, height + rows.height(), bytes).expect("rows are as wide as the picture");
    }

    /// Pixels are stored row after row, so more rows at the bottom are just
    /// more bytes at the end: no copy of what is already there. (Copying the
    /// whole picture for every frame made a long page cost the square of its
    /// length.)
    fn append(&mut self, rows: &RgbaImage) {
        let (width, height) = self.image.dimensions();
        let mut bytes = std::mem::replace(&mut self.image, RgbaImage::new(0, 0)).into_raw();
        bytes.extend_from_slice(rows.as_raw());
        self.image = RgbaImage::from_raw(width, height + rows.height(), bytes).expect("rows are as wide as the picture");
    }

    /// The finished picture, with the page's stuck footer (if it had one) at the bottom.
    pub fn finish(mut self) -> RgbaImage {
        if let Some(footer) = self.footer.take() {
            self.append(&footer);
        }
        self.image
    }
}

/// How many rows from the start of the pair are identical. For a header stuck
/// to the top that is its height; for content that scrolled it is near nothing.
fn static_band<'a>(pairs: impl Iterator<Item = (&'a u64, &'a u64)>) -> usize {
    pairs.take_while(|(a, b)| a == b).count()
}

/// The shift (in rows, content moved up) at which the new frame best agrees
/// with the previous one within the `live` rows, or None if no shift is
/// believable.
/// The share of the voting rows in `live` that agree when the new frame is
/// the old one moved up by `shift`; None if too few rows vote.
fn agreement_at(previous: &Rows, next: &Rows, live: std::ops::Range<usize>, shift: usize) -> Option<f64> {
    let mut agreeing = 0;
    let mut voting = 0;
    for i in live.start..live.end - shift {
        if let Some(agrees) = rows_agree(previous, i + shift, next, i) {
            voting += 1;
            agreeing += agrees as usize;
        }
    }
    (voting >= MIN_VOTING_ROWS).then(|| agreeing as f64 / voting as f64)
}

fn best_shift(previous: &Rows, next: &Rows, live: std::ops::Range<usize>) -> Option<usize> {
    best_shift_from(previous, next, live, 1)
}

/// The shift (in rows, content moved up, `from` or more) at which the new frame
/// agrees with the previous one clearly better than at any other shift.
///
/// "Clearly" is what makes this work on a page with video on it: the rows
/// with the video in never agree, so even the right shift may only reach a
/// half or less, but every wrong shift gets close to nothing, and the right
/// one stands out. A page of repeating rows has several shifts that agree about
/// equally, and is refused instead of guessed at.
fn best_shift_from(previous: &Rows, next: &Rows, live: std::ops::Range<usize>, from: usize) -> Option<usize> {
    let span = live.end - live.start;
    let mut shares: Vec<(usize, f64)> = Vec::new();
    for shift in from..span {
        if let Some(share) = agreement_at(previous, next, live.clone(), shift) {
            shares.push((shift, share));
        }
    }
    let &(shift, best) = shares.iter().max_by(|x, y| x.1.partial_cmp(&y.1).unwrap_or(std::cmp::Ordering::Equal))?;
    if best < MIN_SHARE {
        return None;
    }
    // The nearest rivals are the same match smeared over a few rows; skip them.
    let rival = shares
        .iter()
        .filter(|(other, _)| other.abs_diff(shift) > 4)
        .map(|(_, share)| *share)
        .fold(0.0, f64::max);
    (best >= MIN_AGREEMENT || best >= rival * STANDS_OUT).then_some(shift)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    const WIDTH: u32 = 200;

    /// A tall "page": every row a different pseudo-random texture, except the
    /// blank bands a real page has between blocks of content.
    fn page(height: u32) -> RgbaImage {
        let mut image = RgbaImage::from_pixel(WIDTH, height, Rgba([255, 255, 255, 255]));
        for y in 0..height {
            if (y / 40) % 5 == 4 {
                continue; // a blank band
            }
            let mut state = y.wrapping_mul(2654435761).wrapping_add(12345);
            for x in 0..WIDTH {
                state = state.wrapping_mul(1664525).wrapping_add(1013904223);
                let v = (state >> 24) as u8;
                if v % 5 < 2 {
                    image.put_pixel(x, y, Rgba([v, v.wrapping_mul(3), v.wrapping_mul(7), 255]));
                }
            }
        }
        image
    }

    fn view(page: &RgbaImage, offset: u32, height: u32) -> RgbaImage {
        image::imageops::crop_imm(page, 0, offset, page.width(), height).to_image()
    }

    fn same(a: &RgbaImage, b: &RgbaImage) -> bool {
        a.dimensions() == b.dimensions() && a.as_raw() == b.as_raw()
    }

    /// Scrolls through `page` in `step`-pixel steps with a window of `window`
    /// rows, stitching as it goes.
    fn scroll(page: &RgbaImage, window: u32, step: u32) -> RgbaImage {
        let mut stitcher = Stitcher::new(view(page, 0, window));
        let mut offset = 0;
        while offset + window < page.height() {
            offset = (offset + step).min(page.height() - window);
            let result = stitcher.push(view(page, offset, window));
            assert!(matches!(result, Step::Appended(_)), "offset {offset}: {result:?}");
        }
        stitcher.finish()
    }

    #[test]
    fn scrolling_a_page_rebuilds_it_exactly() {
        let page = page(2000);
        assert!(same(&scroll(&page, 400, 150), &page));
    }

    #[test]
    fn scrolling_back_up_adds_the_rows_above_and_nothing_twice() {
        let page = page(1500);
        let mut stitcher = Stitcher::new(view(&page, 600, 400));
        // Down 200, then back up over seen rows, then above everything.
        assert!(matches!(stitcher.push(view(&page, 800, 400)), Step::Appended(200)));
        assert!(matches!(stitcher.push(view(&page, 700, 400)), Step::Back(100, 0)));
        assert!(matches!(stitcher.push(view(&page, 500, 400)), Step::Back(200, 100)));
        assert!(matches!(stitcher.push(view(&page, 300, 400)), Step::Back(200, 200)));
        // And down again over what is known adds nothing until the end is passed.
        assert!(matches!(stitcher.push(view(&page, 600, 400)), Step::Appended(0)));
        assert!(matches!(stitcher.push(view(&page, 900, 400)), Step::Appended(100)));
        let result = stitcher.finish();
        assert!(same(&result, &view(&page, 300, 1000)));
    }

    #[test]
    fn a_small_step_and_a_large_step_agree() {
        let page = page(1500);
        assert!(same(&scroll(&page, 400, 40), &page));
        assert!(same(&scroll(&page, 400, 300), &page));
    }

    #[test]
    fn the_last_step_may_be_shorter() {
        // 1010 is not a multiple of the 200px step: the final frame overlaps more.
        let page = page(1010);
        assert!(same(&scroll(&page, 400, 200), &page));
    }

    #[test]
    fn a_header_stuck_to_the_top_is_kept_once() {
        let page = page(2000);
        let header = view(&page, 0, 50);
        let mut stitcher = Stitcher::new(view(&page, 0, 400));
        let mut offset = 0;
        while offset + 400 < page.height() {
            offset = (offset + 150).min(page.height() - 400);
            let mut frame = view(&page, offset, 400);
            image::imageops::replace(&mut frame, &header, 0, 0);
            assert!(matches!(stitcher.push(frame), Step::Appended(_)));
        }
        let result = stitcher.finish();
        // The header is in the first frame, at the top, and nowhere else.
        assert_eq!(result.dimensions(), page.dimensions());
        assert!(same(&view(&result, 0, 50), &header));
        assert!(same(&view(&result, 200, 1800), &view(&page, 200, 1800)));
    }

    #[test]
    fn a_footer_stuck_to_the_bottom_is_added_once_at_the_end() {
        let page = page(2000);
        let footer = view(&page, 100, 40);
        let mut first = view(&page, 0, 400);
        image::imageops::replace(&mut first, &footer, 0, 360);
        let mut stitcher = Stitcher::new(first);
        let mut offset = 0;
        while offset + 400 < page.height() {
            offset = (offset + 150).min(page.height() - 400);
            let mut frame = view(&page, offset, 400);
            image::imageops::replace(&mut frame, &footer, 0, 360);
            assert!(matches!(stitcher.push(frame), Step::Appended(_)));
        }
        let result = stitcher.finish();
        // One footer at the very bottom, and the page above it intact.
        assert!(same(&view(&result, result.height() - 40, 40), &footer));
        assert!(same(&view(&result, 0, 300), &view(&page, 0, 300)));
        assert!(same(&view(&result, 800, 800), &view(&page, 800, 800)));
    }

    #[test]
    fn an_unmoved_frame_is_no_change() {
        let page = page(900);
        let mut stitcher = Stitcher::new(view(&page, 0, 400));
        assert_eq!(stitcher.push(view(&page, 0, 400)), Step::NoChange);
        assert_eq!(stitcher.height(), 400);
    }

    #[test]
    fn a_jump_past_the_overlap_is_no_match_and_adds_nothing() {
        let page = page(2000);
        let mut stitcher = Stitcher::new(view(&page, 0, 400));
        assert_eq!(stitcher.push(view(&page, 700, 400)), Step::NoMatch);
        assert_eq!(stitcher.height(), 400);
    }

    #[test]
    fn a_frame_of_a_different_size_is_no_match() {
        let page = page(900);
        let mut stitcher = Stitcher::new(view(&page, 0, 400));
        assert_eq!(stitcher.push(view(&page, 100, 300)), Step::NoMatch);
    }

    #[test]
    fn blank_frames_do_not_pretend_to_line_up() {
        let blank = RgbaImage::from_pixel(WIDTH, 300, Rgba([255, 255, 255, 255]));
        let mut stitcher = Stitcher::new(blank.clone());
        // Identical blank frames: nothing moved.
        assert_eq!(stitcher.push(blank), Step::NoChange);
    }
}
