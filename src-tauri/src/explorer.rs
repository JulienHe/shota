//! "Edit with Shota" in Explorer's right-click menu on image files.
//!
//! Two mechanisms, like launch at startup (see startup.rs):
//!
//! - **Installed from GitHub:** a verb under
//!   `HKCU\Software\Classes\SystemFileAssociations\.<ext>\shell`, written at
//!   launch and removed when the setting is turned off. Per-user, no
//!   elevation. `SystemFileAssociations` adds the verb without touching
//!   which app opens the file by default.
//! - **Installed from the Store:** declared in `AppxManifest.xml`. A
//!   packaged app's registry writes are virtualized and Explorer never sees
//!   them, so there is nothing to do here, and nothing to toggle.
//!
//! Either way Explorer starts `shota.exe "<path>"`, and the single-instance
//! plugin hands that path to the copy already running (see lib.rs).
//!
//! On Windows 11 the verb appears under "Show more options", where every
//! app without a packaged shell extension appears.

use tauri::{AppHandle, Manager};

use crate::i18n;
use crate::state::AppState;

/// Extensions that get the verb. The ones people actually right-click;
/// `import::IMAGE_EXTENSIONS` also opens the rarer ones by drop or picker.
const EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "gif"];

/// Writes or removes the verb to match the setting. Registry I/O, so the
/// callers run it off the main thread.
pub fn apply(app: &AppHandle) {
    if crate::startup::is_packaged() {
        return;
    }
    let enabled = app.state::<AppState>().preferences().explorer_menu;
    let result = if enabled { imp::register(app) } else { imp::unregister(app) };
    if let Err(err) = result {
        eprintln!("updating the Explorer menu failed: {err}");
    }
}

/// The verb's key name. From the product name, so `tauri dev` ("Shota Dev")
/// gets its own entry instead of pointing the real one at a dev build.
fn verb_key(app: &AppHandle) -> String {
    format!("{}.Edit", app.package_info().name.replace(' ', ""))
}

fn label(app: &AppHandle) -> String {
    let locale = app.state::<AppState>().locale();
    i18n::t(&locale, "import.explorerVerb")
}

#[cfg(windows)]
mod imp {
    use tauri::AppHandle;
    use windows::core::HSTRING;
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows::Win32::System::Registry::{RegDeleteTreeW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};

    use super::{label, verb_key, EXTENSIONS};

    fn shell_key(ext: &str, verb: &str) -> String {
        format!("Software\\Classes\\SystemFileAssociations\\.{ext}\\shell\\{verb}")
    }

    fn set_string(subkey: &str, name: Option<&str>, value: &str) -> Result<(), String> {
        let wide: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
        let name = name.map(HSTRING::from).unwrap_or_default();
        let result = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                &HSTRING::from(subkey),
                &name,
                REG_SZ.0,
                Some(wide.as_ptr().cast()),
                (wide.len() * 2) as u32,
            )
        };
        result.ok().map_err(|e| e.to_string())
    }

    pub fn register(app: &AppHandle) -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe = exe.display().to_string();
        // Both quoted: the install path and the file's path can have spaces.
        let command = format!("\"{exe}\" \"%1\"");
        let verb = verb_key(app);
        let label = label(app);
        for ext in EXTENSIONS {
            let key = shell_key(ext, &verb);
            set_string(&key, None, &label)?;
            set_string(&key, Some("Icon"), &exe)?;
            set_string(&format!("{key}\\command"), None, &command)?;
        }
        Ok(())
    }

    pub fn unregister(app: &AppHandle) -> Result<(), String> {
        let verb = verb_key(app);
        for ext in EXTENSIONS {
            let result = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(shell_key(ext, &verb))) };
            if result != ERROR_SUCCESS && result != ERROR_FILE_NOT_FOUND {
                return Err(format!("{result:?}"));
            }
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::AppHandle;

    pub fn register(_app: &AppHandle) -> Result<(), String> {
        Ok(())
    }

    pub fn unregister(_app: &AppHandle) -> Result<(), String> {
        Ok(())
    }
}
