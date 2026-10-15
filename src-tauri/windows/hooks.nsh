; NSIS installer hooks (bundle.windows.nsis.installerHooks in tauri.conf.json).

; "Edit with Shota" is written to the registry by the app itself at launch
; (src/explorer.rs), so the installer has nothing to add. Uninstalling has to
; take it away, or Explorer keeps offering a verb that points at a deleted
; exe. Keep the extensions in step with EXTENSIONS in explorer.rs.
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.png\shell\Shota.Edit"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.jpg\shell\Shota.Edit"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.jpeg\shell\Shota.Edit"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.webp\shell\Shota.Edit"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.bmp\shell\Shota.Edit"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.gif\shell\Shota.Edit"
!macroend
