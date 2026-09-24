import { Component, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Every window here draws its own chrome (decorations(false)), so if a
 * window's React tree throws during render there's no native title bar
 * left to close it with — it's just stuck. This catches that instead of
 * leaving a blank, unclosable window, and surfaces the actual error so it
 * can be diagnosed instead of guessed at.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("Render crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#1c1d22",
            color: "#e4e4e7",
            fontFamily: "sans-serif",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
            WebkitUserSelect: "none",
          }}
          data-tauri-drag-region
        >
          <div>Something went wrong.</div>
          <pre style={{ fontSize: 12, opacity: 0.7, maxWidth: 480, whiteSpace: "pre-wrap" }}>
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => getCurrentWindow().close()}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "none",
              background: "#3d7bfd",
              color: "white",
              cursor: "pointer",
            }}
          >
            Close window
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
