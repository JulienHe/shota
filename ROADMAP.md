# Roadmap

Where Shota is going, release by release. Each release has one theme. Patches (0.x.y) are fixes,
polish, translations and dependencies; minors (0.x.0) are features. 0.9 is followed by 0.10, and
1.0 is a deliberate step, not the next number.

## Releases

| Version | Theme | What's in it |
|---|---|---|
| 0.6.1 | Fixes | New captures start plain; full screen captures the monitor under the cursor |
| 0.7.0 | In and out | Drag the result into other apps, open/paste/drop any image to edit, "Edit with Shota", Windows Share. The "after capture" setting did not make it in; Print Screen is now served by a keyboard hook (Windows 11 was swallowing it) |
| 0.7.1 | Fixes | Print Screen opens the capture on the first press; focus returns to the previous app after Copy, Save and Esc |
| 0.7.2 | Multi-monitor | Selections across monitors, mixed DPI, safer pixelate, first automated tests. Waits for a second monitor to test on; the stitching and cropping maths is already covered by tests |
| 0.8.0 | Precise capture | Freeze the screen while selecting, a pixel loupe that names the colour under the cursor (scroll to zoom, right-click to copy it), the overlay lined up to the pixel |
| 0.9.0 | Text and pins | Copy text from an area (Windows OCR), QR codes, pin a screenshot above other windows, a bar of capture kinds on the overlay |
| 0.10.0 | Editor depth | Arrow heads, text styles, favourite colours, frame looks and shapes, export size, rotate and flip (with crop ratios), edits remembered with the capture, `.shota` project files |
| 0.11.0 | Scrolling capture | Beta, on its own because it's the riskiest piece: drag over the content and Shota scrolls it and joins the pictures (or scroll by hand), keeping stuck headers and footers once |
| 0.12.0 | Interface | Toolbar tools in clusters with the shapes sharing one button, a bottom bar that keeps only drag, Copy and Save with the rest in a "..." menu (Share, Pin, export size, projects). Settings were already grouped by page and are unchanged |
| 0.12.x | Hardening | Feature freeze, bugs, performance, translation review |
| 1.0 | Stable | See below |

## Decisions

- **Interface rework (0.12.0):** the editor toolbar already carries fourteen tools, per-tool style
  controls and a bottom bar of actions, and every feature above adds more. Rather than keep adding
  buttons, 0.12.0 reorganises: frequent actions stay one click away, the rest move into a secondary
  ("more") menu. It comes after the last feature milestone and before the feature freeze, so the new
  layout is what gets hardened.

- **Cloud and uploads:** not now. Sharing goes through drag-out and Windows Share, which need no
  network. Revisit later; doing it would mean updating PRIVACY.md and the MSIX capabilities.
- **Screen recording:** wanted, but it needs its own floating toolbar (start, pause, stop, timer)
  rather than squeezing into the capture overlay. Planned as a separate milestone after the
  screenshot roadmap, not before.
  Choosing the region to record is where aspect ratios belong: lock a ratio (16:9, 4:3, 1:1, vertical)
  while dragging, then move and resize the region before starting. A countdown before it starts is
  useful there too, unlike for screenshots, where the frozen screen already catches what vanishes.
- **Text recognition:** Windows' built-in engine (`Windows.Media.Ocr`). Free, nothing added to the
  download, works offline. No bundled engine.
- **After a capture:** the editor stays the default. An "after capture" setting can come with 0.7.0,
  but opening the editor remains what a new install does.
- **Distribution:** the Microsoft Store is the main channel. It signs and updates Shota, so no
  Authenticode certificate for the GitHub installer. The website, README and release notes lead
  with the Store link; the GitHub installer stays available for people who can't use the Store.

## What 1.0 means

Stable, not "as many features as CleanShot":

- Multi-monitor and mixed-DPI capture are correct.
- The Store build is the one most people use, and Store updates have shipped smoothly for several
  releases in a row.
- Every 1.x opens history and `.shota` files saved by older versions.
- Updates proven on both channels: the Store and the GitHub updater.
- Basic Rust and frontend tests, a CI smoke run, and written speed targets that are met.
- Translations reviewed by native speakers.
- Keyboard navigation and screen reader labels across the editor and settings.

## Not planned

- CleanShot's video editor.
- Anything that changes Windows settings for you, like hiding desktop icons or Do Not Disturb.
- A full Quick Access overlay after every capture (the editor already does that job).
