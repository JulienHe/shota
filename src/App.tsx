import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MainWindow } from "./windows/MainWindow";
import { CaptureOverlay } from "./windows/CaptureOverlay";
import { EditorWindow } from "./windows/EditorWindow";

/** Every shota window loads the same bundle; this routes on the Tauri window label. */
function App() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(getCurrentWindow().label);
  }, []);

  if (label === "overlay") return <CaptureOverlay />;
  if (label === "editor") return <EditorWindow />;
  return <MainWindow />;
}

export default App;
