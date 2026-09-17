import { useEffect, useRef } from "react";
import { TextShape } from "./types";
import { ZoomState } from "../zoom/useZoom";

interface TextEditorOverlayProps {
  shape: TextShape;
  view: ZoomState;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/** Floating HTML textarea positioned over the Konva text node while it's being edited. */
export function TextEditorOverlay({ shape, view, onCommit, onCancel }: TextEditorOverlayProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <textarea
      ref={ref}
      defaultValue={shape.text}
      style={{
        position: "absolute",
        top: shape.y * view.scale + view.y,
        left: shape.x * view.scale + view.x,
        width: shape.width * view.scale,
        fontSize: shape.style.fontSize * view.scale,
        fontFamily: "Segoe UI, sans-serif",
        color: shape.style.stroke,
        background: "rgba(20,21,26,0.85)",
        border: "1px solid #3d7bfd",
        borderRadius: 4,
        padding: 2,
        resize: "none",
        outline: "none",
        lineHeight: 1.2,
      }}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onCommit((e.target as HTMLTextAreaElement).value);
        }
      }}
    />
  );
}
