import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoMeta } from "@/types";

const h = vi.hoisted(() => ({ resolveVideo: vi.fn() }));

vi.mock("./native", () => ({
  native: {
    isTauri: false,
    resolveVideo: h.resolveVideo,
    downloadAudio: vi.fn(async () => "mock://audio"),
    readClipboard: vi.fn(async () => ""),
    hideWindow: vi.fn(async () => {}),
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
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("resolve-failed");
    expect(result.detail).toMatch(/[\u4e00-\u9fff]/);
  });

  it("surfaces Chinese network copy when resolve times out", async () => {
    h.resolveVideo.mockRejectedValue(
      new Error("ERROR: Unable to download webpage: <urlopen error [Errno 110] Connection timed out>"),
    );
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("network");
    expect(result.detail).toMatch(/网络/);
    expect(result.detail).toMatch(/[\u4e00-\u9fff]/);
    expect(result.detail).not.toBe("解析失败，请检查链接后重试");
  });

  it("surfaces Chinese unavailable copy when the video cannot be fetched", async () => {
    h.resolveVideo.mockRejectedValue(
      new Error("ERROR: [BiliBili] BV1xx411c7mD: Unable to download webpage: HTTP Error 404: Not Found"),
    );
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unavailable");
    expect(result.detail).toMatch(/[\u4e00-\u9fff]/);
    expect(result.detail).not.toBe("解析失败，请检查链接后重试");
  });

  it("surfaces Chinese fetch-binaries guidance when a sidecar is missing", async () => {
    h.resolveVideo.mockRejectedValue(new Error("Error: No such file or directory (os error 2)"));
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("resolve-failed");
    expect(result.detail).toMatch(/fetch-binaries/);
    expect(result.detail).toMatch(/[\u4e00-\u9fff]/);
    expect(result.detail).not.toMatch(/os error|No such file/i);
  });
});

