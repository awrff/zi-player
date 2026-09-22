import { describe, expect, it } from "vitest";
import { isMultiModifier, pruneIds, rangeIds, toggleId, unionIds } from "./selection";

describe("selection helpers", () => {
  it("toggles an id in and out of the selection", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("builds an inclusive range from the anchor", () => {
    expect(rangeIds(["a", "b", "c", "d"], "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeIds(["a", "b", "c", "d"], "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeIds(["a", "b", "c"], null, "c")).toEqual(["c"]);
    expect(rangeIds(["a", "b"], "a", "missing")).toEqual([]);
  });

  it("unions and prunes ids", () => {
    expect(unionIds(["a"], ["a", "b"])).toEqual(["a", "b"]);
    expect(pruneIds(["a", "b", "c"], ["a", "c"])).toEqual(["a", "c"]);
  });

  it("treats ctrl and meta as multi-select modifiers", () => {
    expect(isMultiModifier({ ctrl: true })).toBe(true);
    expect(isMultiModifier({ meta: true })).toBe(true);
    expect(isMultiModifier({ shift: true })).toBe(false);
  });
});
