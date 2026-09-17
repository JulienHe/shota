import { ReactNode, useEffect, useRef } from "react";
import "./Popover.css";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorClassName?: string;
  children: ReactNode;
}

/** Small floating panel anchored under a toolbar button; closes on outside click. */
export function Popover({ open, onClose, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="popover" ref={ref}>
      {children}
    </div>
  );
}
