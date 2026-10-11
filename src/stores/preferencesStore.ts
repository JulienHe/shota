import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { Preferences, tauriApi } from "../lib/tauriApi";

interface PreferencesState {
  /** Null until loaded. */
  preferences: Preferences | null;
  /** Merges a change in, saves it, and settles on what Rust actually stored. */
  update: (change: Partial<Preferences>) => Promise<void>;
}

/**
 * The user's preferences, kept current in every window.
 *
 * Loaded once per window, then kept in sync by the event Rust emits on every
 * save rather than re-read on demand. The editor window lives for the whole
 * session and is reused for every capture, so reading these on mount alone
 * would keep yesterday's shortcuts and save format until a restart.
 */
export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: null,
  update: async (change) => {
    const current = get().preferences;
    if (!current) return;
    const next = { ...current, ...change };
    // Optimistic, so a select doesn't snap back for a frame while saving.
    set({ preferences: next });
    try {
      set({ preferences: await tauriApi.setPreferences(next) });
    } catch (err) {
      console.error("saving preferences failed", err);
      set({ preferences: current });
    }
  },
}));

let started = false;

/** Call once per window, as early as possible. */
export function startPreferencesSync() {
  if (started) return;
  started = true;
  tauriApi
    .getPreferences()
    .then((preferences) => usePreferencesStore.setState({ preferences }))
    .catch((err) => console.error("loading preferences failed", err));
  listen<Preferences>("shota://preferences-changed", (event) => {
    usePreferencesStore.setState({ preferences: event.payload });
  });
}
