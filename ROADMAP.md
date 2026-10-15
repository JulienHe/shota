# Roadmap

Where Shota is going, release by release. Each release has one theme. Patches (0.x.y) are fixes,
polish, translations and dependencies; minors (0.x.0) are features. 0.9 is followed by 0.10, and
1.0 is a deliberate step, not the next number.

## Releases

| Version | Theme | What's in it |
|---|---|---|
| 0.6.1 | Fixes | New captures start plain; full screen captures the monitor under the cursor |
| 0.6.2 | Multi-monitor | Selections across monitors, mixed DPI, safer pixelate, first automated tests |
| 0.7.0 | In and out | Drag the result into other apps, open/paste/drop any image to edit, "Edit with Shota", Windows Share |
| 0.8.0 | Precise capture | Freeze the screen while selecting, magnifier and crosshair, previous area, self-timer, cursor in capture, crop to aspect ratios |
| 0.9.0 | Text and pins | Copy text from an area (Windows OCR), QR codes, pin a screenshot above other windows |
| 0.10.0 | Editor depth | Arrow styles, text presets, favourite colours, frame presets and aspect ratios, resize on export, rotate and flip, `.shota` project files |
| 0.11.0 | Scrolling capture | Beta, on its own because it's the riskiest piece |
| 0.12.x | Hardening | Feature freeze, bugs, performance, translation review |
| 1.0 | Stable | See below |

## Decisions

- **Cloud and uploads:** not now. Sharing goes through drag-out and Windows Share, which need no
  network. Revisit later; doing it would mean updating PRIVACY.md and the MSIX capabilities.
- **Screen recording:** wanted, but it needs its own floating toolbar (start, pause, stop, timer)
  rather than squeezing into the capture overlay. Planned as a separate milestone after the
  screenshot roadmap, not before.
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
