import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Trash2, X } from "lucide-react";
import { tauriApi, HistoryListItem, toDataUrl } from "../lib/tauriApi";
import { useKeyboardShortcut } from "../lib/useKeyboardShortcut";
import { useTransparentWindow } from "../lib/windowChrome";
import "./HistoryBar.css";

/** Chromeless bottom-of-screen carousel of recent captures, opened with Ctrl+Shift+6. */
export function HistoryBar() {
  const [items, setItems] = useState<HistoryListItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScroll: number } | null>(null);

  useTransparentWindow();

  useEffect(() => {
    tauriApi
      .listHistory()
      .then(setItems)
      .finally(() => tauriApi.historyReady());
  }, []);

  const close = useCallback(() => {
    tauriApi.closeHistoryWindow();
  }, []);

  useKeyboardShortcut({ key: "Escape" }, close, [close]);

  // Clicking anywhere else dismisses the strip. This replaces the close
  // button that used to float above the panel, where it sat on the
  // transparent window background and became invisible over a light
  // desktop. Gated on having actually held focus first: the window is shown
  // and focused in two steps, and acting on the unfocused state in between
  // would close it the instant it opened.
  useEffect(() => {
    let hasBeenFocused = false;
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) hasBeenFocused = true;
      else if (hasBeenFocused) close();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [close]);

  const restore = (id: string) => {
    tauriApi.openHistoryEntry(id).catch((err) => console.error("failed to open history entry", err));
  };

  const copy = async (id: string) => {
    setBusyId(id);
    try {
      await tauriApi.copyHistoryEntry(id);
      // Confirm in place rather than closing: unlike the editor's Copy, you
      // may well want to grab several of these in a row.
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1400);
    } catch (err) {
      console.error("failed to copy history entry", err);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    // Optimistic: the thumbnail disappears on click rather than after a disk
    // write, and is put back if the delete actually failed.
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await tauriApi.deleteHistoryEntry(id);
    } catch (err) {
      console.error("failed to delete history entry", err);
      setItems(previous);
    } finally {
      setBusyId(null);
    }
  };

  // Drag-to-scroll the strip. Opening an entry is now an explicit Restore
  // button rather than a click on the thumbnail, so this no longer has to
  // tell a drag from a tap — it only has to stay out of the buttons' way.
  const onPointerDown = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    // A press that starts on one of the hover actions is a button press, not
    // a drag — leave it entirely to the button's own click handler.
    if ((e.target as HTMLElement).closest("[data-action]")) return;
    dragRef.current = { startX: e.clientX, startScroll: track.scrollLeft };
    track.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const track = trackRef.current;
    const drag = dragRef.current;
    if (!track || !drag) return;
    track.scrollLeft = drag.startScroll - (e.clientX - drag.startX);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (items.length === 0) return null;

  return (
    <div className="history-bar">
      <button type="button" className="history-bar__close" title="Close" aria-label="Close" onClick={close}>
        <X size={13} strokeWidth={2.5} />
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
          <div key={item.id} className="history-card" data-busy={busyId === item.id || undefined}>
            <div className="history-card__frame">
              <img src={toDataUrl(item.thumbnail_base64)} alt="" draggable={false} />

              <div className="history-card__actions">
                <button
                  type="button"
                  data-action
                  className="history-card__restore"
                  onClick={() => restore(item.id)}
                >
                  Restore
                </button>

                <button
                  type="button"
                  data-action
                  className="history-card__icon history-card__icon--delete"
                  title="Delete"
                  aria-label="Delete"
                  onClick={() => remove(item.id)}
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                </button>

                <button
                  type="button"
                  data-action
                  className="history-card__icon history-card__icon--copy"
                  title={copiedId === item.id ? "Copied" : "Copy"}
                  aria-label="Copy"
                  onClick={() => copy(item.id)}
                >
                  <Copy size={14} strokeWidth={2.2} />
                </button>
              </div>

              {copiedId === item.id && <div className="history-card__toast">Copied</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
