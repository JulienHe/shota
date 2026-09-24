import { useEffect, useRef } from "react";
import { TextShape } from "./types";
import { cssFontFamily } from "./fonts";
import { ZoomState } from "../zoom/useZoom";
import { imageToAbsolute, imageLengthToAbsolute } from "../zoom/viewTransform";

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

  const pos = imageToAbsolute(view, { x: shape.x, y: shape.y });

  return (
    <textarea
      ref={ref}
      defaultValue={shape.text}
      style={{
        position: "absolute",
        top: pos.y,
        left: pos.x,
        width: imageLengthToAbsolute(view, shape.width),
        fontSize: imageLengthToAbsolute(view, shape.style.fontSize),
        fontFamily: cssFontFamily(shape.style.fontFamily),
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
        // e.nativeEvent.isComposing is true while an IME (Japanese, Chinese,
        // Korean, …) is still resolving a candidate — the Enter that
        // confirms the composition also matches this key/shiftKey check, so
        // without this guard it both finalized the IME text AND committed
        // the whole text box out from under it, sometimes leaving a stray
        // trailing line in the committed text (which then genuinely made the
        // shape taller, not a caching bug).
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onCommit((e.target as HTMLTextAreaElement).value);
        }
      }}
    />
  );
}
