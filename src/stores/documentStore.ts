import { create } from "zustand";
import { Shape, ShapeStyle } from "../features/annotate/types";

const MAX_HISTORY = 50;

interface DocumentState {
  image: string | null; // data URL
  imageWidth: number;
  imageHeight: number;
  shapes: Shape[];
  selectedShapeId: string | null;
  past: Shape[][];
  future: Shape[][];

  loadImage: (dataUrl: string, width: number, height: number) => void;
  replaceImage: (dataUrl: string, width: number, height: number, shapes: Shape[]) => void;

  addShape: (shape: Shape) => void;
  updateShape: (id: string, patch: Partial<Shape>) => void;
  updateShapeStyle: (id: string, patch: Partial<ShapeStyle>) => void;
  removeShape: (id: string) => void;
  selectShape: (id: string | null) => void;

  commit: () => void; // push current shapes onto history (call before a mutation batch)
  undo: () => void;
  redo: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  shapes: [],
  selectedShapeId: null,
  past: [],
  future: [],

  loadImage: (dataUrl, width, height) =>
    set({
      image: dataUrl,
      imageWidth: width,
      imageHeight: height,
      shapes: [],
      selectedShapeId: null,
      past: [],
      future: [],
    }),

  replaceImage: (dataUrl, width, height, shapes) =>
    set({ image: dataUrl, imageWidth: width, imageHeight: height, shapes, selectedShapeId: null }),

  addShape: (shape) => {
    get().commit();
    set((s) => ({ shapes: [...s.shapes, shape], selectedShapeId: shape.id }));
  },

  updateShape: (id, patch) =>
    set((s) => ({
      shapes: s.shapes.map((shape) => (shape.id === id ? ({ ...shape, ...patch } as Shape) : shape)),
    })),

  updateShapeStyle: (id, patch) => {
    get().commit();
    set((s) => ({
      shapes: s.shapes.map((shape) =>
        shape.id === id ? ({ ...shape, style: { ...shape.style, ...patch } } as Shape) : shape,
      ),
    }));
  },

  removeShape: (id) => {
    get().commit();
    set((s) => ({
      shapes: s.shapes.filter((shape) => shape.id !== id),
      selectedShapeId: s.selectedShapeId === id ? null : s.selectedShapeId,
    }));
  },

  selectShape: (id) => set({ selectedShapeId: id }),

  commit: () =>
    set((s) => ({
      past: [...s.past.slice(-MAX_HISTORY + 1), s.shapes],
      future: [],
    })),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return {
        shapes: previous,
        past: s.past.slice(0, -1),
        future: [s.shapes, ...s.future],
        selectedShapeId: null,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const [next, ...rest] = s.future;
      return {
        shapes: next,
        past: [...s.past, s.shapes],
        future: rest,
        selectedShapeId: null,
      };
    }),
}));
