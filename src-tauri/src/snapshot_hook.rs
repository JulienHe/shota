//! Print Screen through a low-level keyboard hook instead of `RegisterHotKey`.
//!
//! On Windows 11 the bare Print Screen key can be consumed by the system
//! itself, after hooks have seen it but before any registered hotkey fires.
//! `RegisterHotKey(VK_SNAPSHOT)` still *succeeds* (nothing else holds the
//! key), so Shota reports no error and the shortcut simply never arrives ~
//! even with "Use the Print screen button to open screen capture" switched
//! off. Measured on this machine: a hook saw both the press and the release,
//! a registered hotkey for the same key received nothing, while F9 and
//! Alt+Print Screen behaved normally through `RegisterHotKey`.
//!
//! So any shortcut whose key is Print Screen is served here, and never
//! registered with the OS as well, or a press that does get through would
//! capture twice. The hook swallows a matching press so the Snipping Tool
//! doesn't open over Shota's own overlay.
//!
//! Everything else keeps using `RegisterHotKey`: it needs no resident hook
//! and no thread, and a hook sits in the path of every keystroke on the
//! machine, so it should do as little as it can get away with.

#[cfg(not(windows))]
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

#[cfg(not(windows))]
use crate::hotkeys::ShortcutKind;

/// The modifiers of `accelerator` when it is a Print Screen shortcut, which is
/// the signal that it belongs to the hook rather than to `RegisterHotKey`.
pub fn modifiers_of(accelerator: &str) -> Option<Modifiers> {
    if !cfg!(windows) {
        return None;
    }
    let shortcut: Shortcut = accelerator.parse().ok()?;
    (shortcut.key == Code::PrintScreen).then_some(shortcut.mods)
}

#[cfg(windows)]
pub use imp::{bind, clear, is_bound, unbind};

#[cfg(not(windows))]
pub fn bind(_app: &AppHandle, _kind: ShortcutKind, _mods: Modifiers) {}
#[cfg(not(windows))]
pub fn unbind(_kind: ShortcutKind) {}
#[cfg(not(windows))]
pub fn clear() {}
#[cfg(not(windows))]
pub fn is_bound(_kind: ShortcutKind) -> bool {
    false
}

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, Once, OnceLock};

    use tauri::AppHandle;
    use tauri_plugin_global_shortcut::Modifiers;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT, VK_SNAPSHOT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    use crate::hotkeys::{self, ShortcutKind};

    /// One slot per kind, in `ShortcutKind` declaration order.
    static BINDINGS: Mutex<[Option<Modifiers>; 3]> = Mutex::new([None; 3]);
    static APP: OnceLock<AppHandle> = OnceLock::new();
    static STARTED: Once = Once::new();
    /// Set from a swallowed press until its release, so the release is
    /// swallowed too even if the modifiers were let go first.
    static SWALLOWING: AtomicBool = AtomicBool::new(false);

    fn slot(kind: ShortcutKind) -> usize {
        match kind {
            ShortcutKind::Fullscreen => 0,
            ShortcutKind::Area => 1,
            ShortcutKind::History => 2,
        }
    }

    fn kind_at(index: usize) -> ShortcutKind {
        [ShortcutKind::Fullscreen, ShortcutKind::Area, ShortcutKind::History][index]
    }

    pub fn bind(app: &AppHandle, kind: ShortcutKind, mods: Modifiers) {
        let _ = APP.set(app.clone());
        BINDINGS.lock().unwrap()[slot(kind)] = Some(mods);
        STARTED.call_once(|| {
            std::thread::spawn(run_hook_thread);
        });
    }

    pub fn unbind(kind: ShortcutKind) {
        BINDINGS.lock().unwrap()[slot(kind)] = None;
    }

    /// Releases every binding, for recording a new shortcut. The hook itself
    /// stays installed; with nothing bound it passes every key through.
    pub fn clear() {
        *BINDINGS.lock().unwrap() = [None; 3];
    }

    pub fn is_bound(kind: ShortcutKind) -> bool {
        BINDINGS.lock().unwrap()[slot(kind)].is_some()
    }

    fn run_hook_thread() {
        // A low-level hook is called on the thread that installed it, through
        // that thread's message loop, so the thread has to pump messages.
        let hook = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0) };
        if let Err(err) = hook {
            eprintln!("could not install the Print Screen hook: {err}");
            return;
        }
        let mut msg = MSG::default();
        unsafe {
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }

    fn down(vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY) -> bool {
        (unsafe { GetAsyncKeyState(vk.0 as i32) } as u16 & 0x8000) != 0
    }

    fn held_modifiers() -> Modifiers {
        let mut mods = Modifiers::empty();
        if down(VK_CONTROL) {
            mods |= Modifiers::CONTROL;
        }
        if down(VK_SHIFT) {
            mods |= Modifiers::SHIFT;
        }
        if down(VK_MENU) {
            mods |= Modifiers::ALT;
        }
        if down(VK_LWIN) || down(VK_RWIN) {
            mods |= Modifiers::SUPER;
        }
        mods
    }

    unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let key = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            if key.vkCode == VK_SNAPSHOT.0 as u32 {
                let message = wparam.0 as u32;
                if message == WM_KEYDOWN || message == WM_SYSKEYDOWN {
                    let held = held_modifiers();
                    let matched = BINDINGS
                        .lock()
                        .unwrap()
                        .iter()
                        .position(|bound| *bound == Some(held));
                    if let Some(index) = matched {
                        // Key repeat sends further presses; only the first fires.
                        if !SWALLOWING.swap(true, Ordering::SeqCst) {
                            fire(kind_at(index));
                        }
                        return LRESULT(1);
                    }
                } else if (message == WM_KEYUP || message == WM_SYSKEYUP)
                    && SWALLOWING.swap(false, Ordering::SeqCst)
                {
                    return LRESULT(1);
                }
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    /// Hands off to the main thread, as `RegisterHotKey` handlers run there,
    /// and so the hook returns at once ~ Windows drops a hook that is slow.
    fn fire(kind: ShortcutKind) {
        let Some(app) = APP.get() else { return };
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || hotkeys::fire(&handle, kind));
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn only_print_screen_shortcuts_belong_to_the_hook() {
        assert_eq!(modifiers_of("PrintScreen"), Some(Modifiers::empty()));
        assert_eq!(modifiers_of("Ctrl+PrintScreen"), Some(Modifiers::CONTROL));
        assert_eq!(modifiers_of("Shift+PrintScreen"), Some(Modifiers::SHIFT));
        assert_eq!(modifiers_of("Ctrl+Alt+4"), None);
        assert_eq!(modifiers_of("F9"), None);
        assert_eq!(modifiers_of("not a shortcut"), None);
    }
}
