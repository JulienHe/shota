import { LucideIcon } from "lucide-react";
import "./IconButton.css";

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function IconButton({ icon: Icon, label, active, disabled, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button${active ? " icon-button--active" : ""}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}
