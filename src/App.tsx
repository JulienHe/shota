import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MainWindow } from "./windows/MainWindow";
import { CaptureOverlay } from "./windows/CaptureOverlay";
import { EditorWindow } from "./windows/EditorWindow";
import { HistoryBar } from "./windows/HistoryBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { tauriApi } from "./lib/tauriApi";
import { setLocale } from "./lib/i18n";

/** Every shota window loads the same bundle; this routes on the Tauri window label. */
function App() {
  const [label, setLabel] = useState<string | null>(null);
  // Nothing renders until the locale is known. Rust resolves it so the native
  // tray and these windows can never disagree, and painting English for one
  // frame and then swapping would be worse than waiting — that frame is the
  // whole lifetime of some of these windows.
  const [localeReady, setLocaleReady] = useState(false);

  useEffect(() => {
    setLabel(getCurrentWindow().label);
    tauriApi
      .getLocale()
      .then(setLocale)
      .catch((err) => console.error("failed to resolve locale", err))
      .finally(() => setLocaleReady(true));
  }, []);

  if (!localeReady) return null;

  let content;
  if (label === "overlay") content = <CaptureOverlay />;
  else if (label === "editor") content = <EditorWindow />;
  else if (label === "history") content = <HistoryBar />;
  else content = <MainWindow />;

  return <ErrorBoundary>{content}</ErrorBoundary>;
}

export default App;
