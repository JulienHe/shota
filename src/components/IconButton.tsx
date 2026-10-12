import { LucideIcon } from "lucide-react";
import "./IconButton.css";

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  /** On/off state for buttons that open something rather than pick a tool:
   * a tint, so it never reads as a second selected tool. */
  toggled?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function IconButton({ icon: Icon, label, active, toggled, disabled, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button${active ? " icon-button--active" : ""}${toggled ? " icon-button--toggled" : ""}`}
      aria-pressed={toggled}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}
