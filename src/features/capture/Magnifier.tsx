import { RefObject, useEffect, useRef } from "react";
import "./Magnifier.css";

/** The loupe's side, in CSS pixels. */
export const SIZE = 135;
/**
 * How many source pixels fit across the loupe, from the closest zoom to the
 * widest. Each divides `SIZE` exactly and is odd, so every source pixel is
 * drawn a whole number of CSS pixels wide (crisp) and one sits dead centre.
 */
export const SPANS = [5, 9, 15, 27, 45];
export const DEFAULT_SPAN_INDEX = 2;
/** Gap between the cursor and the loupe. */
const OFFSET = 22;
/** Room reserved under the loupe for its caption. */
const CAPTION = 26;

interface MagnifierProps {
  /** The canvas holding the frozen screen: the loupe magnifies this. */
  source: RefObject<HTMLCanvasElement | null>;
  /** Pointer position in the overlay window, in CSS pixels. */
  x: number;
  y: number;
  /** Source pixels across the loupe: one of `SPANS`. */
  span: number;
  /**
   * What to write under the loupe in place of the colour, e.g. the size of the
   * selection being dragged. Without it the loupe names the colour under the
   * cursor, which is what it is for when nothing is being selected.
   */
  caption?: string | null;
}

/**
 * A pixel loupe beside the cursor, so a selection can be placed to the pixel.
 * It magnifies the frozen screen itself (not the live one), and flips to the
 * other side of the cursor near the right and bottom edges so it never leaves
 * the window.
 */
export function Magnifier({ source, x, y, span, caption }: MagnifierProps) {
  const zoom = SIZE / span;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swatchRef = useRef<HTMLSpanElement>(null);
  const hexRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const from = source.current;
    const to = canvasRef.current;
    if (!from || !to || from.width === 0) return;
    const context = to.getContext("2d");
    if (!context) return;

    // The frozen screen is in physical pixels, the pointer in CSS pixels.
    const ratio = from.width / window.innerWidth;
    const centreX = Math.round(x * ratio);
    const centreY = Math.round(y * ratio);
    const half = (span - 1) / 2;

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, SIZE, SIZE);
    // Parts of the loupe past the screen edge are simply left empty.
    context.drawImage(from, centreX - half, centreY - half, span, span, 0, 0, SIZE, SIZE);

    // The pixel under the cursor, outlined twice so it reads on any colour.
    const centre = half * zoom;
    context.lineWidth = 1;
    context.strokeStyle = "#000";
    context.strokeRect(centre - 0.5, centre - 0.5, zoom + 1, zoom + 1);
    context.strokeStyle = "#fff";
    context.strokeRect(centre + 0.5, centre + 0.5, zoom - 1, zoom - 1);

    // The colour under the cursor, written straight into the caption: it
    // changes with every mouse move, and re-rendering for it would be waste.
    const hex = hexAt(from, centreX, centreY);
    if (hexRef.current) hexRef.current.textContent = hex ?? "—";
    if (swatchRef.current) swatchRef.current.style.background = hex ?? "transparent";
  }, [source, x, y, span, zoom]);

  const flipX = x + OFFSET + SIZE > window.innerWidth;
  const flipY = y + OFFSET + SIZE + CAPTION > window.innerHeight;
  const left = flipX ? x - OFFSET - SIZE : x + OFFSET;
  const top = flipY ? y - OFFSET - SIZE - CAPTION : y + OFFSET;

  return (
    <div className="magnifier" style={{ left, top, width: SIZE }}>
      <canvas ref={canvasRef} className="magnifier__loupe" width={SIZE} height={SIZE} />
      <div className="magnifier__caption">
        {caption ? (
          caption
        ) : (
          <>
            <span ref={swatchRef} className="magnifier__swatch" />
            <span ref={hexRef} />
          </>
        )}
      </div>
    </div>
  );
}

/** `#RRGGBB` of the pixel at (x, y), or null when that is off the screen or transparent. */
export function hexAt(canvas: HTMLCanvasElement, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
  if (a === 0) return null;
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}
