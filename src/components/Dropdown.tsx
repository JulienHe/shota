import { ReactNode, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Popover } from "./Popover";
import "./Dropdown.css";

interface DropdownProps {
  trigger: ReactNode;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  align?: "start" | "center";
  placement?: "bottom" | "top";
  /** Extra class on the trigger pill for the rare per-usage visual tweak. */
  triggerClassName?: string;
  children: ReactNode;
}

/**
 * A small pill that opens a Popover menu below (or above) it on click — the
 * shared trigger+panel wiring behind every dropdown-style control in the
 * toolbar and status bar (color/stroke/fill pickers, the zoom menu, …), so
 * each one doesn't hand-roll its own open-state/anchor-ref/Popover plumbing.
 */
export function Dropdown({
  trigger,
  open,
  onToggle,
  onClose,
  align = "start",
  placement = "bottom",
  triggerClassName,
  children,
}: DropdownProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  // Points the same direction the menu actually opens.
  const Chevron = placement === "top" ? ChevronUp : ChevronDown;
  return (
    <div className="dropdown">
      <button
        ref={anchorRef}
        type="button"
        className={`dropdown__pill${open ? " dropdown__pill--active" : ""}${triggerClassName ? ` ${triggerClassName}` : ""}`}
        onClick={onToggle}
      >
        {trigger}
        <Chevron size={12} strokeWidth={2} />
      </button>
      <Popover open={open} onClose={onClose} anchorRef={anchorRef} align={align} placement={placement}>
        {children}
      </Popover>
    </div>
  );
}
