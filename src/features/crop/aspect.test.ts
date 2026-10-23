import { describe, expect, it } from "vitest";
import { largestCentredRect } from "./aspect";

describe("largestCentredRect", () => {
  it("is the whole picture when free", () => {
    expect(largestCentredRect(800, 600, null)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("narrows a wide picture to a square, centred", () => {
    expect(largestCentredRect(800, 600, 1)).toEqual({ x: 100, y: 0, width: 600, height: 600 });
  });

  it("shortens a picture for a wider ratio, centred", () => {
    const rect = largestCentredRect(800, 600, 16 / 9);
    expect(rect.width).toBe(800);
    expect(rect.height).toBe(450);
    expect(rect.y).toBe(75);
  });

  it("makes a tall rectangle for a portrait ratio", () => {
    const rect = largestCentredRect(800, 600, 9 / 16);
    expect(rect.height).toBe(600);
    expect(rect.width).toBe(338);
  });
});
