import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoMeta } from "@/types";

const h = vi.hoisted(() => ({ resolveVideo: vi.fn() }));

vi.mock("./native", () => ({
  native: {
    isTauri: false,
    resolveVideo: h.resolveVideo,
    downloadAudio: vi.fn(async () => "mock://audio"),
    readClipboard: vi.fn(async () => ""),
    registerGlobalShortcut: vi.fn(async () => () => {}),
    hideWindow: vi.fn(async () => {}),
    showWindow: vi.fn(async () => {}),
    onWindowShow: vi.fn(() => () => {}),
  },
}));

import { importVideo } from "./importer";
import { useVideoStore } from "@/store/videoStore";

function meta(id: string): VideoMeta {
  return {
    id,
    url: `https://www.bilibili.com/video/${id}`,
    title: `标题-${id}`,
    uploader: "UP主",
    duration: 120,
    cover: "https://example.com/cover.jpg",
  };
}

beforeEach(() => {
  h.resolveVideo.mockReset();
  useVideoStore.setState({ items: [], currentId: null, playing: false });
});

describe("importVideo", () => {
  it("rejects empty input", async () => {
    const result = await importVideo("   ");
    expect(result).toEqual({ ok: false, reason: "not-a-url" });
  });

  it("rejects non-bilibili URLs", async () => {
    const result = await importVideo("https://www.youtube.com/watch?v=x");
    expect(result).toEqual({ ok: false, reason: "not-bilibili" });
  });

  it("resolves and adds a bilibili video", async () => {
    h.resolveVideo.mockResolvedValue(meta("BV1xx411c7mD"));
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.item.id).toBe("BV1xx411c7mD");
    expect(useVideoStore.getState().has("BV1xx411c7mD")).toBe(true);
  });

  it("reports duplicates when already added", async () => {
    useVideoStore.getState().addVideo(meta("BV1xx411c7mD"));
    h.resolveVideo.mockResolvedValue(meta("BV1xx411c7mD"));
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("reports resolve failures", async () => {
    h.resolveVideo.mockRejectedValue(new Error("boom"));
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result).toEqual({ ok: false, reason: "resolve-failed" });
  });
});
