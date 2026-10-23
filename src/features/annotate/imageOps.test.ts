import { describe, expect, it } from "vitest";
import { dimensionsAfter, ImageOp, transformShapes } from "./imageOps";
import { DEFAULT_STYLE, Shape } from "./types";

const base = { rotation: 0, style: DEFAULT_STYLE };
const SIZE = { width: 200, height: 100 };

const arrow: Shape = { ...base, id: "a", type: "arrow", x: 20, y: 10, points: [0, 0, 50, 30] };
const rect: Shape = { ...base, id: "r", type: "rectangle", x: 10, y: 20, width: 40, height: 10 };
const blur: Shape = { ...base, id: "b", type: "blur", x: 10, y: 20, width: 40, height: 10 };
const step: Shape = { ...base, id: "s", type: "step", x: 30, y: 40, number: 1, radius: 12 };

/** Where the shape's anchor (0,0 in its own frame) ends up, and where a local point (px,py) lands in the picture. */
function world(shape: Shape, px: number, py: number) {
  const angle = (shape.rotation * Math.PI) / 180;
  return {
    x: shape.x + px * Math.cos(angle) - py * Math.sin(angle),
    y: shape.y + px * Math.sin(angle) + py * Math.cos(angle),
  };
}

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("dimensionsAfter", () => {
  it("swaps width and height for a quarter turn, not for a half turn", () => {
    expect(dimensionsAfter({ op: "rotate", turns: 1 }, SIZE)).toEqual({ width: 100, height: 200 });
    expect(dimensionsAfter({ op: "rotate", turns: 2 }, SIZE)).toEqual(SIZE);
    expect(dimensionsAfter({ op: "rotate", turns: 3 }, SIZE)).toEqual({ width: 100, height: 200 });
  });
  it("is the crop's size for a crop and unchanged for a flip", () => {
    expect(dimensionsAfter({ op: "crop", x: 5, y: 5, width: 30, height: 20 }, SIZE)).toEqual({ width: 30, height: 20 });
    expect(dimensionsAfter({ op: "flip", axis: "x" }, SIZE)).toEqual(SIZE);
  });
});

describe("transformShapes", () => {
  it("moves a point to where that pixel of the picture goes when it turns clockwise", () => {
    // Top-left of a 200x100 picture goes to the top-right of the 100x200 one.
    const [moved] = transformShapes([{ ...step, x: 0, y: 0 }], { op: "rotate", turns: 1 }, SIZE);
    expect([moved.x, moved.y]).toEqual([100, 0]);
    // Bottom-left goes to the top-left.
    const [bottomLeft] = transformShapes([{ ...step, x: 0, y: 100 }], { op: "rotate", turns: 1 }, SIZE);
    expect([bottomLeft.x, bottomLeft.y]).toEqual([0, 0]);
  });

  it("returns to where it started after four quarter turns", () => {
    const [back] = transformShapes([arrow], { op: "rotate", turns: 3 }, SIZE);
    const [again] = transformShapes([back], { op: "rotate", turns: 1 }, { width: 100, height: 200 });
    close(again.x, arrow.x);
    close(again.y, arrow.y);
    close(again.rotation, 0);
  });

  it("keeps an arrow's tip on the same pixel of the picture through a quarter turn", () => {
    // The tip is at local (50, 30). Rotate the picture and the point of the picture it was on.
    const tipBefore = world(arrow, 50, 30);
    const [turned] = transformShapes([arrow], { op: "rotate", turns: 1 }, SIZE);
    const tipAfter = world(turned, 50, 30);
    // A clockwise quarter turn of a 200x100 picture sends (x, y) to (100 - y, x).
    close(tipAfter.x, SIZE.height - tipBefore.y);
    close(tipAfter.y, tipBefore.x);
  });

  it("gives a blur an axis-aligned box that covers the same pixels after a turn", () => {
    const [turned] = transformShapes([blur], { op: "rotate", turns: 1 }, SIZE) as [typeof blur];
    expect(turned.rotation).toBe(0);
    // (10,20)-(50,30) in a 200x100 picture is, rotated clockwise, x 70..80, y 10..50.
    expect([turned.x, turned.y, turned.width, turned.height]).toEqual([70, 10, 10, 40]);
  });

  it("mirrors a point and negates a shape's own points along the axis", () => {
    const [flipped] = transformShapes([arrow], { op: "flip", axis: "x" }, SIZE) as [typeof arrow];
    expect(flipped.x).toBe(180);
    expect(flipped.y).toBe(10);
    expect(flipped.points).toEqual([-0, 0, -50, 30]);
    // The tip really is at the mirrored place.
    const tipBefore = world(arrow, 50, 30);
    const tipAfter = world(flipped, flipped.points[2], flipped.points[3]);
    close(tipAfter.x, SIZE.width - tipBefore.x);
    close(tipAfter.y, tipBefore.y);
  });

  it("re-anchors a rectangle at its far corner when mirrored", () => {
    const [flipped] = transformShapes([rect], { op: "flip", axis: "x" }, SIZE) as [typeof rect];
    // It covered x 10..50; mirrored it covers 150..190, anchored at 150.
    expect([flipped.x, flipped.width]).toEqual([150, 40]);
    const [flippedY] = transformShapes([rect], { op: "flip", axis: "y" }, SIZE) as [typeof rect];
    // It covered y 20..30; mirrored it covers 70..80.
    expect([flippedY.y, flippedY.height]).toEqual([70, 10]);
  });

  it("is undone by flipping twice", () => {
    for (const shape of [arrow, rect, blur, step]) {
      const [twice] = transformShapes(transformShapes([shape], { op: "flip", axis: "x" }, SIZE), { op: "flip", axis: "x" }, SIZE);
      close(twice.x, shape.x);
      close(twice.y, shape.y);
      close(twice.rotation, shape.rotation);
    }
  });

  it("moves a rotated rectangle correctly when mirrored", () => {
    const turned: Shape = { ...rect, rotation: 30 };
    const cornerBefore = world(turned, 40, 10); // the far corner, in the picture
    const [flipped] = transformShapes([turned], { op: "flip", axis: "x" }, SIZE) as [typeof rect];
    // Mirrored, that far corner is at (W - x, y). In the new frame it is local (0, 10)
    // after re-anchoring (the old near edge is now the far one).
    const cornerAfter = world(flipped, 0, 10);
    close(cornerAfter.x, SIZE.width - cornerBefore.x);
    close(cornerAfter.y, cornerBefore.y);
  });

  it("shifts everything by the crop's origin", () => {
    const op: ImageOp = { op: "crop", x: 5, y: 7, width: 100, height: 50 };
    const [shifted] = transformShapes([rect], op, SIZE);
    expect([shifted.x, shifted.y]).toEqual([5, 13]);
  });
});
