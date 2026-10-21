use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow};

use crate::capture;

use crate::state::AppState;

use super::{
    chromeless_window_builder, cloak_window, place_chromeless_window, remember_foreground, restore_foreground,
    reveal_and_focus,
};

/// How long the overlay waits for its page to paint the frozen screen before
/// revealing anyway. A page that never answers must not leave the capture
/// shortcut dead.
const FREEZE_PAINT_TIMEOUT_MS: u64 = 2000;

const OVERLAY_LABEL: &str = "overlay";
// Far enough off any real monitor that it can never be glimpsed, used only
// while the pre-warmed window is loading (see `prewarm_capture_overlay`).
const OFFSCREEN_POS: f64 = -32000.0;

fn virtual_desktop_bounds(app: &AppHandle) -> Result<(f64, f64, f64, f64), String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let (min_x, min_y, max_x, max_y) = monitors.iter().fold(
        (i32::MAX, i32::MAX, i32::MIN, i32::MIN),
        |(min_x, min_y, max_x, max_y), m| {
            let pos = m.position();
            let size = m.size();
            (
                min_x.min(pos.x),
                min_y.min(pos.y),
                max_x.max(pos.x + size.width as i32),
                max_y.max(pos.y + size.height as i32),
            )
        },
    );
    let scale = monitors.first().map(|m| m.scale_factor()).unwrap_or(1.0);
    Ok((
        min_x as f64 / scale,
        min_y as f64 / scale,
        (max_x - min_x) as f64 / scale,
        (max_y - min_y) as f64 / scale,
    ))
}

fn build_overlay_window(app: &AppHandle, x: f64, y: f64, width: f64, height: f64) -> Result<WebviewWindow, String> {
    let window = chromeless_window_builder(app, OVERLAY_LABEL, "shota-overlay")
        .build()
        .map_err(|e| e.to_string())?;

    place_chromeless_window(&window, x, y, width, height)?;
    Ok(window)
}

/// Starts a capture: freezes the screen, then shows it in a transparent,
/// always-on-top, borderless window spanning the full virtual desktop (all
/// monitors) so the user can drag out a region or hover a window to select it.
///
/// The screen is grabbed *first*, on a worker thread (a 4K grab is real
/// work, and this is called from the main thread). The overlay window is then
/// positioned and told to paint that image, and is only revealed once it has
/// (`overlay_painted`), so the live screen is never seen to jump to the
/// frozen one. If the grab fails the overlay still opens, over the live screen,
/// as it always used to.
///
/// Reuses the overlay window: it's cloaked (not destroyed) after every capture
/// specifically so it can be revealed instantly, already loaded and styled,
/// instead of recreating it (and re-triggering a white flash) every time.
pub fn open_capture_overlay(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    // Already showing, or already on its way: a second grab now would capture
    // the overlay itself, or race the first.
    if state.is_overlay_open() || state.is_freeze_pending() {
        return Ok(());
    }
    state.set_freeze_pending(true);

    let handle = app.clone();
    std::thread::spawn(move || {
        match capture::capture_desktop() {
            Ok(desktop) => {
                handle.state::<AppState>().set_freeze(desktop);
            }
            Err(err) => {
                eprintln!("could not freeze the screen, opening over the live one: {err}");
                handle.state::<AppState>().clear_freeze();
            }
        }

        let on_main = handle.clone();
        let queued = handle.run_on_main_thread(move || {
            if let Err(err) = present_overlay(&on_main) {
                eprintln!("failed to open capture overlay: {err}");
                on_main.state::<AppState>().set_freeze_pending(false);
            }
        });
        if queued.is_err() {
            handle.state::<AppState>().set_freeze_pending(false);
            return;
        }

        // Watchdog: if the page never reports back, open anyway.
        std::thread::sleep(std::time::Duration::from_millis(FREEZE_PAINT_TIMEOUT_MS));
        if handle.state::<AppState>().is_freeze_pending() {
            eprintln!("capture overlay did not paint the frozen screen in time; revealing it anyway");
            let on_main = handle.clone();
            let _ = handle.run_on_main_thread(move || reveal_overlay(&on_main));
        }
    });
    Ok(())
}

/// Main thread. Puts the overlay over the desktop and tells its page to paint
/// the frozen screen.
fn present_overlay(app: &AppHandle) -> Result<(), String> {
    let (x, y, width, height) = virtual_desktop_bounds(app)?;

    if let Some(existing) = app.get_webview_window(OVERLAY_LABEL) {
        // The pre-warmed window (or one left over from a prior capture) may
        // still be positioned/sized for a stale monitor layout ~ put it back
        // over the real bounds every time, not just on first creation.
        existing
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        existing
            .set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;

        // Only ask a page that has actually mounted. Pressing the capture
        // shortcut in the gap between the pre-warmed window being created and
        // its page finishing load used to uncloak an empty one ~ a full-screen
        // always-on-top overlay with nothing in it and no way out, since Escape
        // is handled by the JS that hadn't run. Staying cloaked here isn't a
        // lost capture: the page is already loading, and `overlay_ready` picks
        // the request up the moment it mounts.
        if app.state::<AppState>().is_overlay_ready() {
            announce_freeze(app);
        } else {
            eprintln!(
                "capture overlay not ready yet (page still loading); it will pick the capture up on mount"
            );
        }
        return Ok(());
    }

    app.state::<AppState>().reset_overlay_ready();
    build_overlay_window(app, x, y, width, height)?;
    Ok(())
}

/// Tells the overlay page a frozen screen is waiting, or, if there isn't one
/// (the grab failed), reveals it over the live screen.
fn announce_freeze(app: &AppHandle) {
    let state = app.state::<AppState>();
    match state.freeze() {
        Some((id, _)) => {
            let _ = app.emit("shota://freeze", id);
        }
        // Id 0 tells the page to clear whatever it last painted and report
        // back, so a stale frozen screen never shows over the live one.
        None => {
            let _ = app.emit("shota://freeze", 0u64);
        }
    }
}

/// The id of the frozen screen the overlay page should paint, if one is
/// waiting. Asked for by the page when it mounts, because an event sent before
/// it had mounted is lost.
pub fn pending_freeze(app: &AppHandle) -> Option<u64> {
    let state = app.state::<AppState>();
    if state.is_freeze_pending() {
        Some(state.freeze().map(|(id, _)| id).unwrap_or(0))
    } else {
        None
    }
}

/// The overlay page has painted frozen screen `id`: show it.
pub fn overlay_painted(app: &AppHandle, id: u64) {
    let current = app.state::<AppState>().freeze().map(|(current, _)| current).unwrap_or(0);
    if current == id {
        reveal_overlay(app);
    }
}

/// Main thread. Uncloaks the overlay and gives it the keyboard.
fn reveal_overlay(app: &AppHandle) {
    let state = app.state::<AppState>();
    if !state.is_freeze_pending() {
        return;
    }
    state.set_freeze_pending(false);
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        state.set_overlay_open(true);
        remember_foreground();
        reveal_and_focus(&window);
    }
}

/// Creates the overlay window ahead of time, cloaked, so its page has
/// already loaded and applied its transparent styling by the time the user
/// actually presses the capture shortcut ~ otherwise the very first capture
/// of the session has to load the page from scratch and briefly flashes
/// WebView2's opaque default background.
///
/// Cloaking immediately after creation (rather than the old approach of
/// building off-screen, waiting a fixed delay, then calling `.hide()`) has
/// no race to get wrong: there's no window of time where a real capture
/// could beat a timer to the window and get yanked away mid-use, because
/// nothing here is time-based at all. `open_capture_overlay` uncloaks it
/// like any other reuse. Still built off-screen at a tiny size as a second,
/// independent layer of invisibility in case cloaking ever fails outright
/// (e.g. a pre-2004 Windows build, where `DwmSetWindowAttribute` for
/// `DWMWA_CLOAK` is a no-op) ~ `open_capture_overlay` already resets both
/// position and size before ever using it for real.
pub fn prewarm_capture_overlay(app: &AppHandle) {
    app.state::<AppState>().reset_overlay_ready();
    let window = match build_overlay_window(app, OFFSCREEN_POS, OFFSCREEN_POS, 1.0, 1.0) {
        Ok(w) => w,
        Err(err) => {
            eprintln!("failed to pre-warm capture overlay: {err}");
            return;
        }
    };
    cloak_window(&window, true);
}

/// Called once the overlay page has applied its transparent styling, so the
/// window only becomes visible after it can no longer flash white. Only
/// fires on the very first mount (the JS effect that calls this never runs
/// again once the window is being reused, since React never remounts) ~
/// `open_capture_overlay` handles every later reveal directly.
pub fn show_capture_overlay(app: &AppHandle) -> Result<(), String> {
    app.state::<AppState>().mark_overlay_ready();

    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        // On the pre-warm path this runs while the window is still parked
        // off-screen at 1x1, so uncloaking shows nothing ~ which is the
        // point. `open_capture_overlay` positions and reveals it for real.
        // When the user beat the page to it, the window is already sized
        // over the desktop and this is the reveal.
        if is_prewarm_parked(&window) {
            return Ok(());
        }
        // The user asked for a capture before the page had mounted: it is
        // waiting for exactly this.
        if app.state::<AppState>().is_freeze_pending() {
            announce_freeze(app);
        }
    }
    Ok(())
}

/// Whether the overlay is still sitting where `prewarm_capture_overlay` put
/// it, rather than over the real desktop ~ i.e. nobody has asked for a
/// capture yet.
fn is_prewarm_parked(window: &WebviewWindow) -> bool {
    match window.outer_position() {
        Ok(pos) => (pos.x as f64) < OFFSCREEN_POS / 2.0 && (pos.y as f64) < OFFSCREEN_POS / 2.0,
        Err(_) => false,
    }
}

/// Cloaks (without destroying) the overlay window so its selection-rectangle
/// chrome isn't still on screen when the actual pixels get captured, and so
/// it's ready to be revealed instantly (already loaded and styled) next time
/// instead of being recreated from scratch.
pub fn hide_capture_overlay(app: &AppHandle) -> Result<(), String> {
    app.state::<AppState>().set_overlay_open(false);
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        cloak_window(&window, true);
    }
    Ok(())
}

/// Hides the overlay for a cancel (Esc) and gives the foreground back to the
/// app the user was in. A finished capture does not call this: the editor
/// opens and takes the foreground itself.
pub fn cancel_capture_overlay(app: &AppHandle) -> Result<(), String> {
    hide_capture_overlay(app)?;
    app.state::<AppState>().clear_freeze();
    restore_foreground();
    Ok(())
}
