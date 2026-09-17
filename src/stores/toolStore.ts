import { create } from "zustand";
import { DEFAULT_STYLE, ShapeStyle, ToolId } from "../features/annotate/types";

interface ToolState {
  activeTool: ToolId;
  style: ShapeStyle;
  setActiveTool: (tool: ToolId) => void;
  updateStyle: (patch: Partial<ShapeStyle>) => void;
}

export const useToolStore = create<ToolState>((set) => ({
  activeTool: "select",
  style: DEFAULT_STYLE,
  setActiveTool: (tool) => set({ activeTool: tool }),
  updateStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
}));
