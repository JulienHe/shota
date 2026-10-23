import { describe, expect, it } from "vitest";
import { normaliseColor, withColor, withPreset } from "./favoritesStore";

describe("favourite colours", () => {
  it("treats upper and lower case as one colour", () => {
    expect(normaliseColor(" #FF0000 ")).toBe("#ff0000");
    expect(withColor(["#ff0000"], "#FF0000")).toEqual(["#ff0000"]);
  });

  it("puts the newest first and keeps each colour once", () => {
    expect(withColor(["#111111", "#222222"], "#222222")).toEqual(["#222222", "#111111"]);
    expect(withColor(["#111111"], "#333333")).toEqual(["#333333", "#111111"]);
  });

  it("keeps at most the limit, dropping the oldest", () => {
    const list = ["#000001", "#000002", "#000003"];
    expect(withColor(list, "#000004", 3)).toEqual(["#000004", "#000001", "#000002"]);
  });
});

describe("text presets", () => {
  const preset = {
    stroke: "#ffffff",
    fontSize: 36,
    fontFamily: "Segoe UI",
    textStrokeEnabled: true,
    textStrokeColor: "#000000",
  };

  it("does not save the same look twice", () => {
    expect(withPreset([preset], { ...preset })).toHaveLength(1);
  });

  it("keeps different looks, newest first", () => {
    const other = { ...preset, fontSize: 18 };
    expect(withPreset([preset], other)).toEqual([other, preset]);
  });
});
