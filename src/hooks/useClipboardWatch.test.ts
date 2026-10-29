import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoStore } from "@/store/videoStore";

const h = vi.hoisted(() => ({
  readClipboard: vi.fn(),
  onWindowShow: vi.fn(),
  show: null as (() => void) | null,
  unlisten: vi.fn(),
}));

vi.mock("@/lib/native", () => ({
  native: {
    readClipboard: h.readClipboard,
    onWindowShow: h.onWindowShow,
  },
}));

import { useClipboardWatch } from "./useClipboardWatch";

const URL_A = "https://www.bilibili.com/video/BV1xx411c7mD";
const URL_B = "https://www.bilibili.com/video/BV1xx411c7mE";

beforeEach(() => {
  h.readClipboard.mockReset();
  h.onWindowShow.mockReset();
  h.show = null;
  h.unlisten.mockReset();
  h.readClipboard.mockResolvedValue("");
  h.onWindowShow.mockImplementation((cb: () => void) => {
    h.show = cb;
    return h.unlisten;
  });
  useVideoStore.setState({ items: [] });
});

describe("useClipboardWatch", () => {
  it("prompts only once for the same URL even when the window is shown again", async () => {
    h.readClipboard.mockResolvedValue(URL_A);
    const onDetect = vi.fn();
    renderHook(() => useClipboardWatch(onDetect));

    await waitFor(() => expect(onDetect).toHaveBeenCalledTimes(1));
    expect(onDetect).toHaveBeenCalledWith(URL_A);

    await act(async () => {
      h.show?.();
    });
    await waitFor(() => expect(h.readClipboard).toHaveBeenCalledTimes(2));
    expect(onDetect).toHaveBeenCalledTimes(1);

    h.readClipboard.mockResolvedValue(URL_B);
    await act(async () => {
      h.show?.();
    });
    await waitFor(() => expect(onDetect).toHaveBeenCalledTimes(2));
    expect(onDetect).toHaveBeenLastCalledWith(URL_B);
  });

  it("does not prompt for a video that is already in the library", async () => {
    h.readClipboard.mockResolvedValue(URL_A);
    useVideoStore.setState({
      items: [
        {
          id: "BV1xx411c7mD",
          url: URL_A,
          title: "已收藏",
          uploader: "UP主",
          duration: 120,
          cover: "",
          addedAt: 1,
        },
      ],
    });
    const onDetect = vi.fn();
    renderHook(() => useClipboardWatch(onDetect));

    await waitFor(() => expect(h.readClipboard).toHaveBeenCalledTimes(1));
    expect(onDetect).not.toHaveBeenCalled();
  });
});
