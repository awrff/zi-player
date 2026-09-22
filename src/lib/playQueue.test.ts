import { describe, expect, it } from "vitest";
import {
  nextId,
  nextPlayableId,
  nextRepeatMode,
  playOrder,
  prevId,
  prevPlayableId,
  repeatLabel,
  shouldRestartOnPrev,
  shuffleLabel,
  shuffledOrder,
  skipRepeat,
} from "./playQueue";

describe("shuffledOrder", () => {
  it("pins the current track first and shuffles the rest", () => {
    const order = shuffledOrder(["a", "b", "c", "d"], "c", () => 0);
    expect(order[0]).toBe("c");
    expect(order.slice(1).sort()).toEqual(["a", "b", "d"]);
    expect(order).toHaveLength(4);
  });

  it("shuffles the whole list when current is missing", () => {
    const order = shuffledOrder(["a", "b"], null, () => 0);
    expect(order.sort()).toEqual(["a", "b"]);
  });
});

describe("playOrder", () => {
  it("uses the shuffle snapshot when present", () => {
    expect(playOrder(["a", "b"], ["b", "a"])).toEqual(["b", "a"]);
    expect(playOrder(["a", "b"], null)).toEqual(["a", "b"]);
  });
});

describe("nextId / prevId", () => {
  const order = ["a", "b", "c"];

  it("advances and stops at the end when repeat is off", () => {
    expect(nextId(order, "a", "off")).toBe("b");
    expect(nextId(order, "c", "off")).toBeNull();
  });

  it("wraps when repeat is all", () => {
    expect(nextId(order, "c", "all")).toBe("a");
    expect(prevId(order, "a", "all")).toBe("c");
  });

  it("skips unplayable ids", () => {
    const playable = (id: string) => id !== "b";
    expect(nextPlayableId(order, "a", "off", playable)).toBe("c");
    expect(prevPlayableId(order, "c", "off", playable)).toBe("a");
    expect(nextPlayableId(order, "c", "off", playable)).toBeNull();
    expect(nextPlayableId(order, "c", "all", playable)).toBe("a");
  });

  it("stays on the current track when repeat is one", () => {
    expect(nextId(order, "b", "one")).toBe("b");
  });

  it("goes to the previous track and stays on the first when repeat is off", () => {
    expect(prevId(order, "b", "off")).toBe("a");
    expect(prevId(order, "a", "off")).toBe("a");
  });
});

describe("shouldRestartOnPrev", () => {
  it("restarts after 3 seconds", () => {
    expect(shouldRestartOnPrev(3)).toBe(false);
    expect(shouldRestartOnPrev(3.1)).toBe(true);
  });
});

describe("repeat helpers", () => {
  it("cycles off → all → one → off", () => {
    expect(nextRepeatMode("off")).toBe("all");
    expect(nextRepeatMode("all")).toBe("one");
    expect(nextRepeatMode("one")).toBe("off");
  });

  it("labels the current mode, and the turn-on action when off", () => {
    expect(shuffleLabel(false)).toBe("打开随机");
    expect(shuffleLabel(true)).toBe("随机播放");
    expect(repeatLabel("off")).toBe("打开列表循环");
    expect(repeatLabel("all")).toBe("列表循环");
    expect(repeatLabel("one")).toBe("单曲循环");
  });

  it("treats single-track repeat as off when skipping", () => {
    expect(skipRepeat("one")).toBe("off");
    expect(skipRepeat("all")).toBe("all");
  });
});
