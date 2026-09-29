mod editor;
mod history;
mod overlay;

pub use editor::{
    hide_editor_window, open_editor_from_history, open_editor_with_history, prewarm_editor_window,
    show_editor_window,
};
pub use history::{close_history_window, show_history_window, toggle_history_window};
pub use overlay::{hide_capture_overlay, open_capture_overlay, prewarm_capture_overlay, show_capture_overlay};

use tauri::{AppHandle, LogicalPosition, LogicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Builder preset for shota's chromeless floating windows (the capture
/// overlay and the history strip): transparent, borderless, always on top,
/// no taskbar entry, not resizable.
///
/// Both windows had this same seven-call chain written out separately,
/// which is how they drifted — only one of them was excluded from screen
/// capture and had its open animation disabled, for no reason anyone chose.
/// `finish_chromeless_window` applies those two.
///
/// `.visible(true)` is not optional here: WebView2 appears to defer loading
/// and running the page entirely while a window is invisible, so building
/// one hidden deadlocks rather than merely flashing. Windows that shouldn't
/// be seen yet are cloaked immediately after creation instead (see
/// `cloak_window`).
pub(super) fn chromeless_window_builder<'a>(
    app: &'a AppHandle,
    label: &'a str,
    title: &'a str,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(title)
        .transparent(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(true)
}

/// Places a freshly built chromeless window and applies the two DWM tweaks
/// both of them want.
pub(super) fn place_chromeless_window(
    window: &WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;

    exclude_from_capture(window);
    disable_show_animation(window);
    Ok(())
}

/// Sets a boolean DWM window attribute on a window's raw HWND.
///
/// The `&value as *const i32 as *const c_void` + `size_of` dance that
/// `DwmSetWindowAttribute` requires was written out in full twice (cloaking
/// and the transition disable) before this existed; the unsafe block now
/// exists once.
#[cfg(windows)]
fn set_dwm_flag(
    window: &WebviewWindow,
    attribute: windows::Win32::Graphics::Dwm::DWMWINDOWATTRIBUTE,
    enabled: bool,
) {
    use windows::Win32::Graphics::Dwm::DwmSetWindowAttribute;

    if let Ok(hwnd) = window.hwnd() {
        // The Win32 BOOL these attributes expect is a plain 4-byte int, not
        // the `windows` crate's own wrapper type (avoids depending on
        // exactly where that type lives across crate versions).
        let value: i32 = if enabled { 1 } else { 0 };
        let _ = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                attribute,
                &value as *const i32 as *const core::ffi::c_void,
                std::mem::size_of::<i32>() as u32,
            )
        };
    }
}

/// Toggles DWM cloaking: the window stays "shown" as far as Tauri/WebView2
/// are concerned (keeps running its JS, keeps its position/size, keeps
/// `WS_VISIBLE` true), but the compositor simply doesn't display it.
///
/// This is a direct `DwmSetWindowAttribute` call via the raw HWND
/// (`window.hwnd()`, a cheap field read) — deliberately NOT going through
/// any of Tauri's own window-dispatch machinery (`.hide()`/`.show()`,
/// `.with_webview()`, `.center()`, `.outer_position()`, ...). Those are all
/// message-passed to the main event loop and, when called from a command
/// that's itself already running inline on the main thread (which is how a
/// *sync* command invoked via the webview's own IPC channel executes),
/// re-enter that same dispatch machinery from inside its own callback —
/// which is exactly what hung Shota outright on Escape/close when this was
/// briefly swapped for real `hide()`/`show()` plus an explicit
/// `with_webview` call to the WebView2 controller. Cloaking's raw HWND call
/// sidesteps all of that.
///
/// Known trade-off, not yet solved: cloaking is DWM/compositor-level state,
/// which doesn't survive a Windows session change — logging off and back in
/// (or an RDP/lock-screen cycle) can reset it, un-hiding a cloaked window
/// showing whatever it last had on screen (the last screenshot). That's a
/// real but rarer and far less disruptive bug than a hang, so this is the
/// deliberate choice for now until that's addressed separately.
#[cfg(windows)]
pub(super) fn cloak_window(window: &WebviewWindow, cloak: bool) {
    set_dwm_flag(window, windows::Win32::Graphics::Dwm::DWMWA_CLOAK, cloak);
}

/// Turns off DWM's default open/close window transition (a brief fade).
/// A chromeless window is borderless and transparent, so that fade reads as
/// a stray animated flash over the screen rather than a normal window
/// appearing — these should just be there instantly.
#[cfg(windows)]
pub(super) fn disable_show_animation(window: &WebviewWindow) {
    set_dwm_flag(
        window,
        windows::Win32::Graphics::Dwm::DWMWA_TRANSITIONS_FORCEDISABLED,
        true,
    );
}

/// Marks a window as excluded from screen capture at the DWM compositor
/// level (`WDA_EXCLUDEFROMCAPTURE`, Windows 10 2004+), so its chrome can
/// never end up baked into a screenshot no matter how capture and hide are
/// timed relative to each other. The hide-then-sleep-then-capture dance in
/// `finish_region_capture` / `finish_window_capture` was a race — DWM
/// doesn't necessarily finish un-compositing a hidden always-on-top layered
/// window within a fixed delay, which is why the overlay's border would
/// occasionally still show up in the captured pixels. This makes that race
/// impossible instead of just less likely, so that hide/sleep step is kept
/// only as a cheap extra safety net (e.g. in case this call silently fails
/// on an older Windows build).
#[cfg(windows)]
pub(super) fn exclude_from_capture(window: &WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE};

    if let Ok(hwnd) = window.hwnd() {
        // Best-effort: if this fails (e.g. pre-2004 Windows), the hide+sleep
        // fallback in the capture commands still applies.
        let _ = unsafe { SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) };
    }
}

#[cfg(not(windows))]
pub(super) fn cloak_window(_window: &WebviewWindow, _cloak: bool) {}

#[cfg(not(windows))]
pub(super) fn disable_show_animation(_window: &WebviewWindow) {}

#[cfg(not(windows))]
pub(super) fn exclude_from_capture(_window: &WebviewWindow) {}
