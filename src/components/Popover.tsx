import { CSSProperties, ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Popover.css";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** The trigger element this panel is positioned against. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Which side of the anchor the panel opens toward. Defaults to below. */
  placement?: "bottom" | "top";
  /** Horizontal alignment against the anchor. Defaults to centered. */
  align?: "center" | "start";
  children: ReactNode;
}

/**
 * Small floating panel anchored to a toolbar button; closes on outside
 * click. Portals into `document.body` and positions itself with `fixed`
 * coordinates measured from the anchor, rather than sitting `position:
 * absolute` inside the anchor's own DOM subtree — the toolbar it usually
 * triggers from clips overflow (for its own horizontal-scroll-avoidance
 * reasons unrelated to this panel), which silently clipped/scrollbar'd the
 * panel instead of letting it float freely below the bar.
 */
export function Popover({ open, onClose, anchorRef, placement = "bottom", align = "center", children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = anchorRef.current;
      if (anchor) setRect(anchor.getBoundingClientRect());
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePanel = ref.current?.contains(target);
      const insideAnchor = anchorRef.current?.contains(target);
      if (!insidePanel && !insideAnchor) onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onClose, anchorRef]);

  if (!open || !rect) return null;

  const style: CSSProperties = {
    position: "fixed",
    left: align === "start" ? rect.left : rect.left + rect.width / 2,
    transform: align === "center" ? "translateX(-50%)" : undefined,
  };
  if (placement === "bottom") style.top = rect.bottom + 8;
  else style.bottom = window.innerHeight - rect.top + 8;

  return createPortal(
    <div className="popover" ref={ref} style={style}>
      {children}
    </div>,
    document.body,
  );
}
