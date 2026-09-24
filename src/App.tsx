import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MainWindow } from "./windows/MainWindow";
import { CaptureOverlay } from "./windows/CaptureOverlay";
import { EditorWindow } from "./windows/EditorWindow";
import { HistoryBar } from "./windows/HistoryBar";
import { ErrorBoundary } from "./components/ErrorBoundary";

/** Every shota window loads the same bundle; this routes on the Tauri window label. */
function App() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(getCurrentWindow().label);
  }, []);

  let content;
  if (label === "overlay") content = <CaptureOverlay />;
  else if (label === "editor") content = <EditorWindow />;
  else if (label === "history") content = <HistoryBar />;
  else content = <MainWindow />;

  return <ErrorBoundary>{content}</ErrorBoundary>;
}

export default App;
