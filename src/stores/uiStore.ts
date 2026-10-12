import { create } from "zustand";


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
}

/** Editor-wide UI preferences that aren't part of the document itself. */
export const useUiStore = create<UiState>((set) => ({
  styleMenuOpen: false,
  setStyleMenuOpen: (styleMenuOpen) => set({ styleMenuOpen }),
}));
