mod editor;
mod history;
mod overlay;

pub use editor::{
    hide_editor_window, open_editor_from_history, open_editor_with_history, prewarm_editor_window,
    show_editor_window,
};
pub use history::{close_history_window, show_history_window, toggle_history_window};
pub use overlay::{hide_capture_overlay, open_capture_overlay, prewarm_capture_overlay, show_capture_overlay};

/// Toggles DWM cloaking: the window stays "shown" as far as Tauri/WebView2
/// are concerned (keeps running its JS, keeps its position/size, keeps
/// `WS_VISIBLE` true), but the compositor simply doesn't display it.
///
/// This is a direct, unsafe `DwmSetWindowAttribute` call via the raw HWND
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
pub(super) fn cloak_window(window: &tauri::WebviewWindow, cloak: bool) {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_CLOAK};

    if let Ok(hwnd) = window.hwnd() {
        let value: i32 = if cloak { 1 } else { 0 };
        let _ = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_CLOAK,
                &value as *const i32 as *const core::ffi::c_void,
                std::mem::size_of::<i32>() as u32,
            )
        };
    }
}

#[cfg(not(windows))]
pub(super) fn cloak_window(_window: &tauri::WebviewWindow, _cloak: bool) {}
