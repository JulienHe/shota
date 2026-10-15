//! Launch at startup.
//!
//! Two mechanisms, chosen at runtime by whether Shota is running from an
//! MSIX package, not by build feature: what matters is how *this copy* was
//! installed, and a packaged app's writes to the `Run` key are virtualized
//! into the package, where Windows never looks at sign-in.
//!
//! - **Installed from GitHub:** a value under
//!   `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, which is what
//!   every unpackaged tray app does.
//! - **Installed from the Store:** the `windows.startupTask` declared in
//!   `AppxManifest.xml`, toggled through the WinRT `StartupTask` API. The
//!   task id here must match the manifest's `TaskId` exactly.
//!
//! Both respect the switch in Task Manager's Startup apps tab. Turning it
//! off there wins over Shota's own setting, and the settings page says so
//! rather than showing a toggle that is on but does nothing.

use serde::Serialize;

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Blocked {
    /// Turned off in Task Manager or Windows Settings. Only the user can
    /// turn it back on there; the Store API refuses to override it.
    ByUser,
    /// Turned off by an administrator or group policy.
    ByPolicy,
}

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StartupStatus {
    pub enabled: bool,
    pub blocked: Option<Blocked>,
}

#[cfg(windows)]
pub use imp::{is_packaged, set, status};

#[cfg(not(windows))]
pub fn is_packaged() -> bool {
    false
}

#[cfg(not(windows))]
pub fn status(_app: &tauri::AppHandle) -> StartupStatus {
    StartupStatus { enabled: false, blocked: None }
}

#[cfg(not(windows))]
pub fn set(_app: &tauri::AppHandle, _enabled: bool) -> Result<StartupStatus, String> {
    Err("launch at startup is only supported on Windows".into())
}

#[cfg(windows)]
mod imp {
    use super::StartupStatus;
    use tauri::AppHandle;
    use windows::core::HSTRING;
    use windows::Win32::Foundation::{APPMODEL_ERROR_NO_PACKAGE, ERROR_SUCCESS};
    use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegGetValueW, RegOpenKeyExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, KEY_SET_VALUE, REG_SZ, RRF_RT_REG_BINARY, RRF_RT_REG_SZ,
    };

    /// Must match `TaskId` in `src-tauri/msix/AppxManifest.xml`.
    const STORE_TASK_ID: &str = "ShotaStartup";

    const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    /// Where Task Manager records its own on/off switch for `Run` entries.
    const APPROVED_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";

    /// Whether this copy runs from an MSIX package (the Store build).
    pub fn is_packaged() -> bool {
        let mut len = 0u32;
        let result = unsafe { GetCurrentPackageFullName(&mut len, None) };
        result != APPMODEL_ERROR_NO_PACKAGE
    }

    pub fn status(app: &AppHandle) -> StartupStatus {
        if is_packaged() {
            store::status().unwrap_or(StartupStatus { enabled: false, blocked: None })
        } else {
            registry_status(app)
        }
    }

    pub fn set(app: &AppHandle, enabled: bool) -> Result<StartupStatus, String> {
        if is_packaged() {
            store::set(enabled)
        } else {
            registry_set(app, enabled)?;
            Ok(registry_status(app))
        }
    }

    /// The `Run` value's name. Taken from the product name so `tauri dev`
    /// ("Shota Dev") never overwrites, or is mistaken for, the real install.
    fn value_name(app: &AppHandle) -> HSTRING {
        HSTRING::from(app.package_info().name.as_str())
    }

    fn registry_status(app: &AppHandle) -> StartupStatus {
        let name = value_name(app);
        let mut size = 0u32;
        let present = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                &HSTRING::from(RUN_KEY),
                &name,
                RRF_RT_REG_SZ,
                None,
                None,
                Some(&mut size),
            )
        } == ERROR_SUCCESS;

        // Task Manager stores 12 bytes per entry; an odd first byte (0x03,
        // and 0x01 on some builds) means switched off there, even though
        // the `Run` value itself is untouched.
        let mut approved = [0u8; 12];
        let mut approved_size = approved.len() as u32;
        let disabled_in_task_manager = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                &HSTRING::from(APPROVED_KEY),
                &name,
                RRF_RT_REG_BINARY,
                None,
                Some(approved.as_mut_ptr().cast()),
                Some(&mut approved_size),
            )
        } == ERROR_SUCCESS
            && approved[0] & 1 == 1;

        StartupStatus {
            enabled: present && !disabled_in_task_manager,
            blocked: None,
        }
    }

    fn registry_set(app: &AppHandle, enabled: bool) -> Result<(), String> {
        let name = value_name(app);
        unsafe {
            let run = open_for_write(RUN_KEY)?;
            let result = if enabled {
                let exe = std::env::current_exe().map_err(|e| e.to_string())?;
                // Quoted: the default install path can contain spaces.
                let command = format!("\"{}\"", exe.display());
                let wide: Vec<u16> = command.encode_utf16().chain(Some(0)).collect();
                let bytes = std::slice::from_raw_parts(wide.as_ptr().cast::<u8>(), wide.len() * 2);
                RegSetValueExW(run, &name, None, REG_SZ, Some(bytes))
            } else {
                RegDeleteValueW(run, &name)
            };
            let _ = RegCloseKey(run);
            // Deleting a value that isn't there is the outcome we wanted.
            if !enabled && result == windows::Win32::Foundation::ERROR_FILE_NOT_FOUND {
                return Ok(());
            }
            result.ok().map_err(|e| e.to_string())?;

            // Someone turning this on in Shota after switching it off in
            // Task Manager means it: clear Task Manager's switch too, or the
            // toggle would flip on and silently stay off.
            if enabled {
                if let Ok(approved) = open_for_write(APPROVED_KEY) {
                    let _ = RegDeleteValueW(approved, &name);
                    let _ = RegCloseKey(approved);
                }
            }
        }
        Ok(())
    }

    unsafe fn open_for_write(path: &str) -> Result<HKEY, String> {
        let mut key = HKEY::default();
        RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(path), Some(0), KEY_SET_VALUE, &mut key)
            .ok()
            .map_err(|e| e.to_string())?;
        Ok(key)
    }

    mod store {
        use super::super::{Blocked, StartupStatus};
        use super::STORE_TASK_ID;
        use windows::core::HSTRING;
        use windows::ApplicationModel::{StartupTask, StartupTaskState};

        fn task() -> Result<StartupTask, String> {
            StartupTask::GetAsync(&HSTRING::from(STORE_TASK_ID))
                .and_then(|op| op.get())
                .map_err(|e| e.to_string())
        }

        fn describe(state: StartupTaskState) -> StartupStatus {
            match state {
                StartupTaskState::Enabled | StartupTaskState::EnabledByPolicy => {
                    StartupStatus { enabled: true, blocked: None }
                }
                StartupTaskState::DisabledByUser => {
                    StartupStatus { enabled: false, blocked: Some(Blocked::ByUser) }
                }
                StartupTaskState::DisabledByPolicy => {
                    StartupStatus { enabled: false, blocked: Some(Blocked::ByPolicy) }
                }
                _ => StartupStatus { enabled: false, blocked: None },
            }
        }

        pub fn status() -> Result<StartupStatus, String> {
            let state = task()?.State().map_err(|e| e.to_string())?;
            Ok(describe(state))
        }

        pub fn set(enabled: bool) -> Result<StartupStatus, String> {
            let task = task()?;
            if enabled {
                // Returns the resulting state rather than failing when the
                // user has blocked it in Task Manager, which `describe`
                // turns into the "turn it on in Task Manager" message.
                let state = task
                    .RequestEnableAsync()
                    .and_then(|op| op.get())
                    .map_err(|e| e.to_string())?;
                Ok(describe(state))
            } else {
                task.Disable().map_err(|e| e.to_string())?;
                status()
            }
        }
    }
}
