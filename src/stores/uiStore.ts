import { create } from "zustand";

export type CanvasBackground = "white" | "light-gray" | "gray" | "dark-gray" | "black" | "system";

interface UiState {
  canvasBackground: CanvasBackground;
  setCanvasBackground: (bg: CanvasBackground) => void;
}

/** Editor-wide UI preferences that aren't part of the document itself. */
export const useUiStore = create<UiState>((set) => ({
  canvasBackground: "white",
  setCanvasBackground: (canvasBackground) => set({ canvasBackground }),
}));
