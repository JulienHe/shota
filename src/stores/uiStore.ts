import { create } from "zustand";

/** Sizes the editor can export at, as a fraction of the picture's own size. */
export const EXPORT_SCALES = [2, 1, 0.75, 0.5, 0.25] as const;

const EXPORT_SCALE_KEY = "shota.exportScale";

/** The last size chosen. A per-machine convenience, so browser storage is enough. */
function readExportScale(): number {
  try {
    const stored = Number(localStorage.getItem(EXPORT_SCALE_KEY));
    if ((EXPORT_SCALES as readonly number[]).includes(stored)) return stored;
  } catch {
    // Storage unavailable: full size.
  }
  return 1;
}

interface UiState {
  /**
   * True while a style dropdown in the toolbar is open. The canvas hides the
   * selection handles while it is: they sit directly on the corners you're
   * judging when dragging a corner-radius slider or picking a colour, so
   * leaving them up means you can't actually see what you're changing. The
   * shape stays selected throughout ~ only the handles are hidden ~ so they
   * come straight back when the dropdown closes.
   */
  styleMenuOpen: boolean;
  setStyleMenuOpen: (open: boolean) => void;
  /** What size Copy, Save, Share, Pin and drag-out produce. 1 is the picture's own size. */
  exportScale: number;
  setExportScale: (scale: number) => void;
}

/** Editor-wide UI preferences that aren't part of the document itself. */
export const useUiStore = create<UiState>((set) => ({
  styleMenuOpen: false,
  setStyleMenuOpen: (styleMenuOpen) => set({ styleMenuOpen }),
  exportScale: readExportScale(),
  setExportScale: (exportScale) => {
    try {
      localStorage.setItem(EXPORT_SCALE_KEY, String(exportScale));
    } catch {
      // Not remembered; still applies now.
    }
    set({ exportScale });
  },
}));
