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
//! Two more things about this key were learned the hard way, both of which
//! looked like "I have to press it twice":
//!
//! - Print Screen doesn't reliably deliver both halves of a press. Some arrive
//!   as a key-down with no key-up, some as a key-up with no key-down. See
//!   `handle_half`: a press fires on whichever half arrives first.
//! - Other software installs and re-installs its own keyboard hooks, newest
//!   first in line, and can consume the key before this one hears of it. The
//!   hook is re-installed on a timer to stay at the front.
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
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Instant;
    use std::sync::{Mutex, Once, OnceLock};

    use tauri::AppHandle;
    use tauri_plugin_global_shortcut::Modifiers;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
        VK_SNAPSHOT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetTimer, SetWindowsHookExW, TranslateMessage,
        UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
        WM_SYSKEYUP, WM_TIMER,
    };

    use crate::hotkeys::{self, ShortcutKind};

    const REINSTALL_EVERY_MS: u32 = 250;

    /// One slot per kind, in `ShortcutKind` declaration order.
    static BINDINGS: Mutex<[Option<Modifiers>; 4]> = Mutex::new([None; 4]);
    static APP: OnceLock<AppHandle> = OnceLock::new();
    static STARTED: Once = Once::new();
    /// When the last handled half of a press arrived, in `now_ms` terms.
    static PRESS_AT: AtomicU64 = AtomicU64::new(0);
    /// Halves this close together belong to one press (or key repeat).
    const SAME_PRESS_MS: u64 = 700;

    fn slot(kind: ShortcutKind) -> usize {
        match kind {
            ShortcutKind::Fullscreen => 0,
            ShortcutKind::Area => 1,
            ShortcutKind::History => 2,
            ShortcutKind::Toolbar => 3,
        }
    }

    fn kind_at(index: usize) -> ShortcutKind {
        [ShortcutKind::Fullscreen, ShortcutKind::Area, ShortcutKind::History, ShortcutKind::Toolbar][index]
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
        *BINDINGS.lock().unwrap() = [None; 4];
    }

    pub fn is_bound(kind: ShortcutKind) -> bool {
        BINDINGS.lock().unwrap()[slot(kind)].is_some()
    }

    fn run_hook_thread() {
        // A low-level hook is called on the thread that installed it, through
        // that thread's message loop, so the thread has to pump messages.
        let mut hook = match unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0) } {
            Ok(hook) => hook,
            Err(err) => {
                eprintln!("could not install the Print Screen hook: {err}");
                return;
            }
        };
        let mut msg = MSG::default();
        unsafe {
            // Hooks are called newest first, and other software on the machine
            // (anti-cheat, input utilities) installs and re-installs its own
            // while running. One installed after ours sees the key first and
            // can consume it, after which this hook never hears of the press.
            // Re-installing on a timer keeps ours at the front of the line.
            SetTimer(None, 1, REINSTALL_EVERY_MS, None);
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                if msg.message == WM_TIMER {
                    if let Ok(fresh) = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0) {
                        let _ = UnhookWindowsHookEx(hook);
                        hook = fresh;
                    }
                    continue;
                }
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

    fn find_binding(held: Modifiers) -> Option<usize> {
        BINDINGS.lock().unwrap().iter().position(|bound| *bound == Some(held))
    }

    fn now_ms() -> u64 {
        static START: OnceLock<Instant> = OnceLock::new();
        START.get_or_init(Instant::now).elapsed().as_millis() as u64
    }

    /// Print Screen does not reliably send both halves of a press. Measured on a
    /// real keyboard, some presses arrive as a key-down with no key-up, and
    /// some as a key-up with no key-down (the system eats the other half), so
    /// acting only on the key-down missed those presses and the user had to
    /// press again. A press now fires on whichever half arrives first, and the
    /// other half, if it comes, is recognised as belonging to it.
    ///
    /// `PRESS_AT` is when the last handled half arrived (0 for none). A half
    /// arriving within `SAME_PRESS_MS` of it is the same press, or key repeat;
    /// anything later is a new press, whichever half it is.
    fn handle_half(is_down: bool, held: Modifiers) -> bool {
        let Some(index) = find_binding(held) else {
            return false;
        };
        let now = now_ms() + 1; // never 0, which means "no press yet"
        let last = PRESS_AT.load(Ordering::SeqCst);
        let same_press = last != 0 && now.saturating_sub(last) < SAME_PRESS_MS;
        if !same_press {
            fire(kind_at(index));
        }
        // A key-down that starts a press keeps the window open for its key-up.
        // A key-up that starts one (its down was eaten) closes it: nothing
        // more is coming.
        PRESS_AT.store(if is_down || same_press { now } else { 0 }, Ordering::SeqCst);
        true
    }

    unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let key = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            if key.vkCode == VK_SNAPSHOT.0 as u32 {
                let message = wparam.0 as u32;
                let is_down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
                let is_up = message == WM_KEYUP || message == WM_SYSKEYUP;
                if (is_down || is_up) && handle_half(is_down, held_modifiers()) {
                    return LRESULT(1);
                }
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    /// Hands off to the main thread, as `RegisterHotKey` handlers run there,
    /// and so the hook returns at once ~ Windows drops a slow hook.
    ///
    /// Taking the foreground is not done here. This path never counts as input
    /// to Shota, so Windows won't let it, and the windows that need the
    /// keyboard (the capture overlay, the editor) take it themselves when they
    /// are revealed: see `reveal_and_focus`.
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
