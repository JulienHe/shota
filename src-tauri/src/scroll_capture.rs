//! Scrolling capture (beta): one tall picture of something longer than the screen.
//!
//! The user drags out an area over the content (a web page, a chat, a long
//! document). From then on a loop takes a picture of that area, scrolls it a
//! little, waits for it to stop moving, and takes another; `capture::Stitcher`
//! joins the pictures by finding how far the content moved between them. The
//! loop ends when the content stops moving (the end), the picture gets very
//! large, or the user ends it.
//!
//! It scrolls by sending mouse-wheel input to whatever is under the area, and
//! it also copes with the user scrolling by hand: it only ever looks at how
//! the pictures differ, never at what caused the movement. That matters
//! because injected input is not always honoured. Some programs (anti-cheat,
//! some remote tools) drop it, and then scrolling yourself is the only way, so
//! the loop does not give up on a page that has not moved yet: it waits for
//! the user to start. Some setups turn injected input the other way round
//! (measured on one machine), so the first scroll that moves the content the
//! wrong way flips the wheel.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use image::RgbaImage;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::capture::{self, Step, Stitcher};
use crate::state::AppState;
use crate::windows::{close_scroll_hud, open_editor_with_history, open_scroll_hud};

/// A cap on the picture so a never-ending page (an infinite feed) cannot use
/// all the memory: 150 million pixels is about 600 MB of RGBA.
const MAX_PIXELS: u64 = 150_000_000;
const MAX_HEIGHT: u32 = 40_000;
/// How long to let a scroll animation start before looking at the screen.
const SETTLE_START: Duration = Duration::from_millis(140);
/// Pause between looks while waiting for the content to stop moving.
/// The gap between two looks that tell whether the content is moving on its own.
const MOTION_PROBE: Duration = Duration::from_millis(60);
const SETTLE_POLL: Duration = Duration::from_millis(70);
/// Give up waiting for it to stop and take it as it is.
const SETTLE_LIMIT: Duration = Duration::from_millis(1500);
/// Attempts that moved nothing, in a row, after scrolling had worked: the end.
const END_AFTER_IDLE: u32 = 4;
/// Frames that could not be lined up, in a row, before it says so and stops.
const MAX_MISMATCHES: u32 = 6;
/// How long to wait for scrolling to begin before ending with just the first picture.
const WAIT_FOR_MOVEMENT: Duration = Duration::from_secs(25);
/// The share of the area each scroll aims to move the content by. Enough
/// overlap is left for the stitcher to line the pictures up.
const TARGET_FRACTION: f64 = 0.55;

#[derive(Clone, Copy, Debug)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// What the loop is asked to do from outside (the on-screen buttons, the keys).
#[derive(Default)]
pub struct Session {
    pub finish: AtomicBool,
    pub cancel: AtomicBool,
    /// Whether Shota scrolls the content itself. Off until the user asks: it
    /// takes the pointer and turns the wheel, which must never happen unasked.
    pub auto: AtomicBool,
}

#[derive(Serialize, Clone)]
struct Progress {
    height: u32,
    frames: u32,
    /// "scrolling", "waiting" (for the user to scroll), "toofar" (the user
    /// scrolled past what overlaps) or "stitching".
    phase: &'static str,
}

/// Starts a scrolling capture of `region` on a thread of its own and returns
/// at once. At most one runs at a time.
pub fn start(app: &AppHandle, region: Region) -> Result<(), String> {
    let session = app
        .state::<AppState>()
        .begin_scroll_session()
        .ok_or_else(|| "a scrolling capture is already running".to_string())?;

    open_scroll_hud(app, (region.x, region.y, region.width, region.height));

    let handle = app.clone();
    std::thread::spawn(move || {
        let result = run(&handle, region, &session);
        close_scroll_hud(&handle);
        handle.state::<AppState>().end_scroll_session();
        match result {
            Ok(Some(image)) => {
                let _ = handle.emit("shota://scroll-progress", Progress { height: image.height(), frames: 0, phase: "stitching" });
                match capture::encode_png(image).and_then(|png| open_editor_with_history(&handle, png)) {
                    Ok(()) => {}
                    Err(err) => eprintln!("could not open the scrolling capture: {err}"),
                }
            }
            Ok(None) => {} // cancelled
            Err(err) => eprintln!("scrolling capture failed: {err}"),
        }
    });
    Ok(())
}

fn run(app: &AppHandle, region: Region, session: &Session) -> Result<Option<RgbaImage>, String> {
    // Let the overlay finish leaving the screen before the first look.
    std::thread::sleep(Duration::from_millis(250));

    let take = || capture::capture_region_image(region.x, region.y, region.width, region.height);

    let first = take()?;
    let frame_height = first.height();
    let mut stitcher = Stitcher::new(first);
    let mut frames = 1u32;

    let mut notches = 3i32;
    // Which way the wheel has to turn to move the content down. Some setups
    // turn injected wheel input the other way, so this is learned, once.
    let mut direction = -1i32;
    let mut direction_known = false;
    let mut idle = 0u32;
    let mut mismatches = 0u32;
    let mut moved_once = false;
    // Whether our own wheel clicks have been seen to move the content.
    let mut auto_works = false;
    let started = Instant::now();
    // Keys already held when this began (the Enter or Esc that ended the
    // selection) must not count as the user asking to finish.
    let mut keys = Keys::new();

    progress(app, stitcher.height(), frames, "waiting");

    loop {
        if session.cancel.load(Ordering::SeqCst) || keys.escape_pressed() {
            return Ok(None);
        }
        if session.finish.load(Ordering::SeqCst) || keys.enter_pressed() {
            break;
        }
        let limit = max_height(region.width);
        if stitcher.height() >= limit {
            break;
        }
        if !moved_once && started.elapsed() > WAIT_FOR_MOVEMENT {
            break;
        }

        // Is the content moving by itself (the user scrolling by hand)? Then
        // do not add wheel clicks of our own on top, and take it as it comes:
        // a look mid-scroll is still the same content, just further along.
        let before = take()?;
        std::thread::sleep(MOTION_PROBE);
        let now = take()?;
        let by_hand = before.as_raw() != now.as_raw();
        let mut auto = session.auto.load(Ordering::SeqCst);
        let frame = if by_hand {
            // The user is scrolling: it is theirs, and ours stops. Wheel clicks
            // of ours on top would fight them. Wait for the content to come to
            // rest: a picture taken mid-scroll is drawn between two positions
            // and never lines up with the others.
            if auto {
                session.auto.store(false, Ordering::SeqCst);
                auto = false;
            }
            settled(&take)?
        } else if auto {
            wheel(region, notches * direction);
            std::thread::sleep(SETTLE_START);
            settled(&take)?
        } else {
            // Waiting for the user to scroll: only look.
            std::thread::sleep(SETTLE_POLL);
            now
        };

        let step = stitcher.push(frame);
        match step {
            Step::Appended(shift) => {
                moved_once = true;
                idle = 0;
                mismatches = 0;
                frames += 1;
                if auto {
                    direction_known = true;
                    auto_works = true;
                    // Aim the next scroll at the share of the area that leaves enough overlap.
                    let wanted = frame_height as f64 * TARGET_FRACTION;
                    notches = ((notches as f64 * wanted / shift as f64).round() as i32).clamp(1, 15);
                }
                progress(app, stitcher.height(), frames, "scrolling");
            }
            Step::NoChange => {
                // Only our own scrolling reaching the end means the end. If
                // the wheel never worked, the user is scrolling (or reading):
                // wait for them, they end it with Done or Enter.
                if auto_works && auto {
                    idle += 1;
                    if idle >= END_AFTER_IDLE {
                        break;
                    }
                } else if !moved_once {
                    progress(app, stitcher.height(), frames, "waiting");
                }
            }
            Step::Back(..) => {
                moved_once = true;
                idle = 0;
                if auto && !direction_known {
                    // Our wheel moved the content the wrong way (some setups
                    // turn injected input round): turn it back.
                    direction = -direction;
                }
                direction_known = true;
                progress(app, stitcher.height(), frames, "scrolling");
            }
            Step::NoMatch => {
                if !auto {
                    // Scrolled further than the pictures overlap. Say so, and
                    // keep looking: scrolling back a little will line up again.
                    progress(app, stitcher.height(), frames, "toofar");
                    continue;
                }
                mismatches += 1;
                // Probably scrolled too far for the pictures to overlap: smaller steps.
                notches = (notches / 2).max(1);
                if mismatches >= MAX_MISMATCHES {
                    eprintln!("scrolling capture: the pictures would not line up, stopping with what it has");
                    break;
                }
            }
        }
    }

    progress(app, stitcher.height(), frames, "stitching");
    Ok(Some(stitcher.finish()))
}

fn progress(app: &AppHandle, height: u32, frames: u32, phase: &'static str) {
    let _ = app.emit("shota://scroll-progress", Progress { height, frames, phase });
}

fn max_height(width: u32) -> u32 {
    MAX_HEIGHT.min((MAX_PIXELS / width.max(1) as u64) as u32)
}

/// A look at the area once what is in it has stopped moving: two looks in a
/// row that are the same. Scrolling is animated in most apps, and a picture
/// taken mid-animation cannot be lined up with its neighbours cleanly.
fn settled(take: &dyn Fn() -> Result<RgbaImage, String>) -> Result<RgbaImage, String> {
    let deadline = Instant::now() + SETTLE_LIMIT;
    let mut last = take()?;
    loop {
        std::thread::sleep(SETTLE_POLL);
        let next = take()?;
        if next.as_raw() == last.as_raw() || Instant::now() >= deadline {
            return Ok(next);
        }
        last = next;
    }
}

#[cfg(windows)]
mod input {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_WHEEL, MOUSEINPUT, VK_ESCAPE, VK_RETURN,
    };
    use windows::Win32::UI::WindowsAndMessaging::SetCursorPos;

    use super::Region;

    /// Turns the wheel `notches` clicks over the middle of `region`: negative
    /// is down (content moves up), as the wheel itself reports it.
    pub fn wheel(region: Region, notches: i32) {
        let centre_x = region.x + (region.width / 2) as i32;
        let centre_y = region.y + (region.height / 2) as i32;
        unsafe {
            // Windows decides which window a wheel click belongs to from where
            // the pointer is when the click is *processed*. Send it straight
            // after moving the pointer and it can still land on whatever was
            // there before, so after a move there is a short pause. (Measured:
            // with no pause the content did not scroll at all.)
            let mut at = windows::Win32::Foundation::POINT::default();
            let _ = windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut at);
            let inside = at.x >= region.x
                && at.x < region.x + region.width as i32
                && at.y >= region.y
                && at.y < region.y + region.height as i32;
            if !inside {
                let _ = SetCursorPos(centre_x, centre_y);
                std::thread::sleep(std::time::Duration::from_millis(150));
            }
            let input = INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        // One notch is 120.
                        mouseData: (120 * notches) as u32,
                        dwFlags: MOUSEEVENTF_WHEEL,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            let _ = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
    }

    fn down(vk: i32) -> bool {
        (unsafe { GetAsyncKeyState(vk) } as u16 & 0x8000) != 0
    }

    /// Edge-detected Enter and Esc: only a press that begins after this was made.
    pub struct Keys {
        enter_was_down: bool,
        escape_was_down: bool,
    }

    impl Keys {
        pub fn new() -> Self {
            Self { enter_was_down: down(VK_RETURN.0 as i32), escape_was_down: down(VK_ESCAPE.0 as i32) }
        }

        pub fn enter_pressed(&mut self) -> bool {
            let now = down(VK_RETURN.0 as i32);
            let pressed = now && !self.enter_was_down;
            self.enter_was_down = now;
            pressed
        }

        pub fn escape_pressed(&mut self) -> bool {
            let now = down(VK_ESCAPE.0 as i32);
            let pressed = now && !self.escape_was_down;
            self.escape_was_down = now;
            pressed
        }
    }
}

#[cfg(not(windows))]
mod input {
    use super::Region;

    pub fn wheel(_region: Region, _notches: i32) {}

    pub struct Keys;

    impl Keys {
        pub fn new() -> Self {
            Self
        }
        pub fn enter_pressed(&mut self) -> bool {
            false
        }
        pub fn escape_pressed(&mut self) -> bool {
            false
        }
    }
}

use input::{wheel, Keys};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_wide_area_has_a_lower_height_cap_than_a_narrow_one() {
        assert_eq!(max_height(1000), MAX_HEIGHT);
        // 150M pixels at 4K width is under 40,000 rows.
        assert!(max_height(3840) < MAX_HEIGHT);
        assert_eq!(max_height(3840), (MAX_PIXELS / 3840) as u32);
    }

    #[test]
    fn the_cap_never_divides_by_zero() {
        assert_eq!(max_height(0), MAX_HEIGHT);
    }
}
