import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { tauriApi, HistoryListItem, toDataUrl } from "../lib/tauriApi";
import "./HistoryBar.css";

/** Chromeless bottom-of-screen carousel of recent captures, opened with Ctrl+Shift+6. */
export function HistoryBar() {
  const [items, setItems] = useState<HistoryListItem[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScroll: number; moved: boolean; id: string | null } | null>(null);

  useEffect(() => {
    // A plain CSS rule isn't reliable here — it can lose to the shared
    // global stylesheet's opaque `#root` background depending on injection
    // order. Setting it directly, like the capture overlay does, always wins.
    const root = document.getElementById("root");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    if (root) root.style.background = "transparent";

    tauriApi
      .listHistory()
      .then(setItems)
      .finally(() => tauriApi.historyReady());
  }, []);

  const close = useCallback(() => {
    tauriApi.closeHistoryWindow();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const onPointerDown = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    // The thumbnail under the pointer has to be read here, before capture
    // is set below — once set, pointermove/pointerup retarget `e.target` to
    // the capturing element (the track itself) regardless of what's
    // actually under the cursor, so reading it at pointerup is too late.
    const itemEl = (e.target as HTMLElement).closest<HTMLElement>("[data-history-id]");
    dragRef.current = {
      startX: e.clientX,
      startScroll: track.scrollLeft,
      moved: false,
      id: itemEl?.dataset.historyId ?? null,
    };
    track.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const track = trackRef.current;
    const drag = dragRef.current;
    if (!track || !drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 4) drag.moved = true;
    track.scrollLeft = drag.startScroll - dx;
  };

  // Pointer capture on the track can swallow the child button's native
  // "click" event, so the open-on-click decision is made here (drag vs.
  // tap) instead of relying on an onClick handler on each thumbnail.
  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved || !drag.id) return;
    tauriApi.openHistoryEntry(drag.id);
  };

  if (items.length === 0) return null;

  return (
    <div className="history-bar">
      <button type="button" className="history-bar__close" title="Close" aria-label="Close" onClick={close}>
        <X size={14} strokeWidth={2.5} />
      </button>
      <div
        ref={trackRef}
        className="history-bar__track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {items.map((item) => (
          <div key={item.id} className="history-bar__item" data-history-id={item.id}>
            <img src={toDataUrl(item.thumbnail_base64)} alt="" draggable={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
