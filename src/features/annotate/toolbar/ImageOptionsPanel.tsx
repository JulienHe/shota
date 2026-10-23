import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { IconButton } from "../../../components/IconButton";
import { applyImageOp } from "../documentActions";
import { t } from "../../../lib/i18n";

/**
 * Turning and mirroring the whole picture, shown with the crop tool: all of
 * them are edits to the picture itself rather than to a shape drawn on it.
 * The shapes already drawn move with the picture.
 */
export function ImageOptionsPanel() {
  const run = (op: Parameters<typeof applyImageOp>[0]) => () => {
    applyImageOp(op).catch((err) => console.error("image edit failed", err));
  };
  return (
    <>
      <div className="toolbar__divider" />
      <IconButton icon={RotateCcw} label={t("image.rotateLeft")} onClick={run({ op: "rotate", turns: 3 })} />
      <IconButton icon={RotateCw} label={t("image.rotateRight")} onClick={run({ op: "rotate", turns: 1 })} />
      <IconButton icon={FlipHorizontal2} label={t("image.flipHorizontal")} onClick={run({ op: "flip", axis: "x" })} />
      <IconButton icon={FlipVertical2} label={t("image.flipVertical")} onClick={run({ op: "flip", axis: "y" })} />
    </>
  );
}
