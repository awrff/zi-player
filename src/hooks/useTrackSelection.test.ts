import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTrackSelection } from "./useTrackSelection";

describe("useTrackSelection", () => {
  it("enters manage mode and toggles with ctrl", () => {
    const { result } = renderHook(() => useTrackSelection(["a", "b", "c"]));
    expect(result.current.onItemClick("b", {})).toBe("activate");

    act(() => {
      expect(result.current.onItemClick("b", { ctrl: true })).toBe("select");
    });
    expect(result.current.managing).toBe(true);
    expect(result.current.selectedIds).toEqual(["b"]);

    act(() => {
      expect(result.current.onItemClick("b", {})).toBe("select");
    });
    expect(result.current.selectedIds).toEqual([]);
  });

  it("shift-clicks a visible range", () => {
    const { result } = renderHook(() => useTrackSelection(["a", "b", "c", "d"]));
    act(() => {
      result.current.onItemClick("b", { ctrl: true });
    });
    act(() => {
      result.current.onItemClick("d", { shift: true });
    });
    expect(result.current.selectedIds).toEqual(["b", "c", "d"]);
  });

  it("selects and clears only visible ids", () => {
    const { result } = renderHook(() => useTrackSelection(["b", "c"]));
    act(() => {
      result.current.toggle("a");
      result.current.selectAllVisible();
    });
    expect(result.current.selectedIds).toEqual(["a", "b", "c"]);
    expect(result.current.visibleSelectedIds).toEqual(["b", "c"]);
    expect(result.current.allVisibleSelected).toBe(true);

    act(() => {
      result.current.clearVisible();
    });
    expect(result.current.selectedIds).toEqual(["a"]);
  });

  it("prunes missing ids and exits by clearing state", () => {
    const { result } = renderHook(() => useTrackSelection(["a", "b"]));
    act(() => {
      result.current.toggle("a");
      result.current.toggle("b");
      result.current.prune(["b"]);
    });
    expect(result.current.selectedIds).toEqual(["b"]);

    act(() => {
      result.current.exit();
    });
    expect(result.current.managing).toBe(false);
    expect(result.current.selectedIds).toEqual([]);
  });
});
