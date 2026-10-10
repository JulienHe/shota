//! Whether Windows is holding the Print Screen key for the Snipping Tool.
//!
//! Shota's default capture shortcut is Print Screen, matching every other
//! Windows screenshot tool. Windows 11 ships with Print Screen bound to the
//! Snipping Tool, which can swallow that press before Shota sees it ~ and it
//! does so silently, so the symptom is "the shortcut does nothing" with
//! nothing to indicate why.
//!
//! The binding is a single per-user registry value, writable without
//! elevation, so Shota can both detect it and offer to hand the key over
//! rather than making the user hunt through Settings for a toggle they have
//! no reason to know exists.

/// True when Windows will route Print Screen to the Snipping Tool.
///
/// An unset value counts as owned: Windows 11 treats absent as enabled, so
/// reporting "free" there would be exactly wrong on a clean install, which
/// is the case that matters most.
#[cfg(windows)]
pub fn owned_by_snipping_tool() -> bool {
    use windows::core::w;
    use windows::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD,
    };

    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Control Panel\\Keyboard"),
            w!("PrintScreenKeyForSnippingEnabled"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut value as *mut u32 as *mut core::ffi::c_void),
            Some(&mut size),
        )
    };

    if status.is_err() {
        // Missing value: Windows 11's default is that the Snipping Tool has it.
        return true;
    }
    value != 0
}

/// Hands Print Screen back to applications by clearing the Snipping Tool
/// binding. Per-user, so no elevation and no effect on anyone else.
#[cfg(windows)]
pub fn release_to_apps() -> Result<(), String> {
    use windows::core::w;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_DWORD,
    };

    unsafe {
        let mut key = HKEY::default();
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            w!("Control Panel\\Keyboard"),
            Some(0),
            KEY_SET_VALUE,
            &mut key,
        )
        .ok()
        .map_err(|e| e.to_string())?;

        let zero: u32 = 0;
        let result = RegSetValueExW(
            key,
            w!("PrintScreenKeyForSnippingEnabled"),
            None,
            REG_DWORD,
            Some(&zero.to_ne_bytes()),
        );
        let _ = RegCloseKey(key);
        result.ok().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn owned_by_snipping_tool() -> bool {
    false
}

#[cfg(not(windows))]
pub fn release_to_apps() -> Result<(), String> {
    Ok(())
}
