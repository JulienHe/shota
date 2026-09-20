import { create } from "zustand";

interface ToastState {
  message: string | null;
  show: (message: string, durationMs?: number) => void;
  clear: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * The app's one shared bottom toast (bottom-center of the canvas), used by
 * anything that needs a brief confirmation or error — copy, save, the
 * eyedropper — instead of each feature growing its own local indicator.
 */
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (message, durationMs = 1800) => {
    if (timer) clearTimeout(timer);
    set({ message });
    timer = setTimeout(() => set({ message: null }), durationMs);
  },
  clear: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ message: null });
  },
}));
