# shota

A free, native Windows screenshot & annotation tool — the kind of thing [Shottr](https://shottr.cc/) is on macOS.

## Features

- **Capture**: full screen, drag-select area, or snap to a window (hold `Space` while selecting an area)
- **Shortcuts**: `Ctrl+Alt+F` full screen · `Ctrl+Alt+A` area/window (global, work from anywhere) · `Ctrl+C` copy · `Ctrl+S` save as (remembers the last folder, falls back to Desktop)
- **Annotate**: rectangle, ellipse, line, arrow, text, freehand pen — each with stroke-only / filled / stroke+opacity-fill styles, adjustable stroke width and corner radius
- **Manipulate**: in-place crop, zoom, color picker (eyedropper)

## Tech stack

- [Tauri 2](https://tauri.app/) (Rust) for the native shell, global shortcuts, screen/window capture ([xcap](https://github.com/nashaofu/xcap)), clipboard and file save
- React + TypeScript + Vite for the UI
- [Konva](https://konvajs.org/) / react-konva for the annotation canvas
- [Zustand](https://github.com/pmndrs/zustand) for state
- [Lucide](https://lucide.dev/) for icons

## Project layout

- `src-tauri/src/capture` — screen, region, and window capture (xcap)
- `src-tauri/src/windows` — overlay & editor window lifecycle
- `src-tauri/src/hotkeys.rs`, `clipboard.rs`, `file_save.rs`, `state.rs` — global shortcuts, clipboard, save-dialog/last-folder persistence
- `src/windows` — one component per Tauri window (`MainWindow`, `CaptureOverlay`, `EditorWindow`), routed by window label in `App.tsx`
- `src/features/annotate` — the canvas, shape components, toolbar, style panel
- `src/features/crop`, `src/features/zoom`, `src/features/color-picker` — image manipulation tools
- `src/stores` — Zustand stores (`toolStore` for the active tool/style, `documentStore` for shapes/undo-redo)

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```
