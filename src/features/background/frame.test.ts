import { describe, expect, it } from "vitest";
import { Frame, frameMetrics, parseDocument, serializeDocument } from "./frame";

const base: Frame = { background: { kind: "color", color: "#fff" }, padding: 0, corners: 0, shadow: 0 };

describe("frameMetrics", () => {
  it("surrounds the picture with the padding and nothing else when there is no shape", () => {
    const { bounds, padding } = frameMetrics({ ...base, padding: 50 }, 1000, 500);
    expect(padding).toBe(80);
    expect(bounds).toEqual({ x: -80, y: -80, width: 1160, height: 660 });
  });

  it("widens a tall picture to a square, keeping it centred", () => {
    const { bounds } = frameMetrics({ ...base, aspect: 1 }, 200, 400);
    expect(bounds).toEqual({ x: -100, y: 0, width: 400, height: 400 });
  });

  it("makes a wide picture taller for a square", () => {
    const { bounds } = frameMetrics({ ...base, aspect: 1 }, 400, 200);
    expect(bounds).toEqual({ x: 0, y: -100, width: 400, height: 400 });
  });

  it("reaches the requested shape, within a pixel of rounding", () => {
    for (const ratio of [16 / 9, 9 / 16, 4 / 3]) {
      const { bounds } = frameMetrics({ ...base, padding: 40, aspect: ratio }, 1337, 701);
      expect(Math.abs(bounds.width / bounds.height - ratio)).toBeLessThan(0.01);
    }
  });

  it("never makes the frame smaller than the picture and its padding", () => {
    const plain = frameMetrics({ ...base, padding: 40 }, 800, 600).bounds;
    const shaped = frameMetrics({ ...base, padding: 40, aspect: 16 / 9 }, 800, 600).bounds;
    expect(shaped.width).toBeGreaterThanOrEqual(plain.width);
    expect(shaped.height).toBeGreaterThanOrEqual(plain.height);
  });

  it("keeps the picture inside the bounds", () => {
    const { bounds } = frameMetrics({ ...base, aspect: 9 / 16 }, 300, 300);
    expect(bounds.x).toBeLessThanOrEqual(0);
    expect(bounds.y).toBeLessThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(300);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(300);
  });
});

describe("saved documents", () => {
  it("round-trips edits to the picture", () => {
    const json = serializeDocument([], null, [{ op: "rotate", turns: 1 }]);
    expect(parseDocument(json)?.imageOps).toEqual([{ op: "rotate", turns: 1 }]);
  });

  it("is still the older format when there are no edits, so an older Shota can read it", () => {
    expect(JSON.parse(serializeDocument([], null)).version).toBe(2);
  });

  it("reads an old bare array of shapes", () => {
    const doc = parseDocument("[]");
    expect(doc).toEqual({ shapes: [], frame: null, imageOps: [] });
  });

  it("opens a corrupt entry as a plain capture", () => {
    expect(parseDocument("{not json")).toBeNull();
  });
});
