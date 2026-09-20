import { useEffect, useRef } from "react";
import { getSampleCanvas } from "./sampleColor";
import "./EyedropperHud.css";

const GRID = 7; // odd, so there's a true center pixel under the cursor

interface EyedropperHudProps {
  screenX: number;
  screenY: number;
  imageElement: HTMLImageElement;
  sampleX: number;
  sampleY: number;
  hex: string;
  /** On-screen pixels per source pixel — scroll while picking to adjust. */
  zoom: number;
}

/** A small circular loupe that tracks the cursor while the eyedropper tool is active, showing magnified pixels and the live hex value; click to copy (confirmed via the app's shared toast), scroll to zoom. */
export function EyedropperHud({ screenX, screenY, imageElement, sampleX, sampleY, hex, zoom }: EyedropperHudProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = GRID * zoom;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const source = getSampleCanvas(imageElement);
    const half = Math.floor(GRID / 2);
    const sx = Math.round(sampleX) - half;
    const sy = Math.round(sampleY) - half;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, sx, sy, GRID, GRID, 0, 0, canvas.width, canvas.height);

    // Highlight the exact center pixel the hex value comes from.
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(half * zoom, half * zoom, zoom, zoom);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(half * zoom + 1, half * zoom + 1, zoom - 2, zoom - 2);
  }, [imageElement, sampleX, sampleY, zoom]);

  // Centering the loupe directly on the cursor hid the very pixel it was
  // meant to preview, under the OS cursor icon itself. Top-aligned with the
  // cursor and offset to the right keeps the sampled point clear while
  // staying easy to track by eye.
  const gap = 14;
  const left = screenX + gap;
  const top = screenY;

  return (
    <div className="eyedropper-hud" style={{ left, top, width: size, height: size }}>
      <canvas ref={canvasRef} width={size} height={size} className="eyedropper-hud__preview" />
      <div className="eyedropper-hud__hex">{hex.toUpperCase()}</div>
    </div>
  );
}
