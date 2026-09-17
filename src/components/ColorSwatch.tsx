import "./ColorSwatch.css";

const PALETTE = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#3d7bfd", "#af52de", "#ffffff", "#111111"];

interface ColorSwatchProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorSwatch({ value, onChange }: ColorSwatchProps) {
  return (
    <div className="color-swatch">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={`color-swatch__dot${value === color ? " color-swatch__dot--active" : ""}`}
          style={{ background: color }}
          onClick={() => onChange(color)}
          aria-label={color}
        />
      ))}
      <input
        type="color"
        className="color-swatch__custom"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Custom color"
      />
    </div>
  );
}
