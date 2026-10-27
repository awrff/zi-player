import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoMeta } from "@/types";

const h = vi.hoisted(() => ({
  resolveVideo: vi.fn(),
  fetchCover: vi.fn(),
  downloadAudio: vi.fn(),
  cancelImport: vi.fn(async () => {}),
  onImportProgress: vi.fn(() => () => {}),
}));

vi.mock("./native", () => ({
  native: {
    isTauri: false,
    resolveVideo: h.resolveVideo,
    fetchCover: h.fetchCover,
    downloadAudio: h.downloadAudio,
    cancelImport: h.cancelImport,
    onImportProgress: h.onImportProgress,
    readClipboard: vi.fn(async () => ""),
    hideWindow: vi.fn(async () => {}),
    onWindowShow: vi.fn(() => () => {}),
  },
}));

import { importVideo } from "./importer";
import { resetImportQueue } from "./importQueue";
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
  resetImportQueue();
  h.resolveVideo.mockReset();
  h.fetchCover.mockReset();
  h.downloadAudio.mockReset();
  h.fetchCover.mockResolvedValue("asset://cover");
  h.downloadAudio.mockResolvedValue("/data/audio/BV.ogg");
  useVideoStore.setState({ items: [], currentId: null, playing: false });
});

describe("importVideo", () => {
  it("rejects empty input", async () => {
    const result = await importVideo("   ");
    expect(result).toEqual({ ok: false, reason: "not-a-url" });
  });

  it("rejects unsupported URLs", async () => {
    const result = await importVideo("https://www.youtube.com/watch?v=x");
    expect(result).toEqual({ ok: false, reason: "unsupported-url" });
  });

  it("enqueues a placeholder immediately", async () => {
    h.resolveVideo.mockReturnValue(new Promise(() => {}));
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.item.id).toBe("BV1xx411c7mD");
    expect(useVideoStore.getState().has("BV1xx411c7mD")).toBe(true);
    expect(useVideoStore.getState().items[0].importStatus).toMatch(/queued|resolving/);
  });

  it("reports duplicates when already added", async () => {
    useVideoStore.getState().addVideo(meta("BV1xx411c7mD"));
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result).toEqual({ ok: false, reason: "duplicate" });
    expect(h.resolveVideo).not.toHaveBeenCalled();
  });

  it("finishes resolve and transcode in the background", async () => {
    h.resolveVideo.mockResolvedValue(meta("BV1xx411c7mD"));
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result.ok).toBe(true);
    await vi.waitFor(() => {
      expect(useVideoStore.getState().items[0].importStatus).toBe("ready");
    });
    expect(useVideoStore.getState().items[0].title).toBe("标题-BV1xx411c7mD");
    expect(useVideoStore.getState().items[0].cachePath).toBe("/data/audio/BV.ogg");
    expect(h.downloadAudio).toHaveBeenCalled();
  });

  it("marks the card failed when resolve fails", async () => {
    h.resolveVideo.mockRejectedValue(new Error("boom"));
    const result = await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    expect(result.ok).toBe(true);
    await vi.waitFor(() => {
      expect(useVideoStore.getState().items[0].importStatus).toBe("failed");
    });
    expect(useVideoStore.getState().items[0].importError).toMatch(/[\u4e00-\u9fff]/);
  });

  it("surfaces Chinese network copy when resolve times out", async () => {
    h.resolveVideo.mockRejectedValue(
      new Error("ERROR: Unable to download webpage: <urlopen error [Errno 110] Connection timed out>"),
    );
    await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    await vi.waitFor(() => {
      expect(useVideoStore.getState().items[0].importStatus).toBe("failed");
    });
    expect(useVideoStore.getState().items[0].importError).toMatch(/网络/);
    expect(useVideoStore.getState().items[0].importError).not.toBe("解析失败，请检查链接后重试");
  });

  it("surfaces Chinese unavailable copy when the video cannot be fetched", async () => {
    h.resolveVideo.mockRejectedValue(
      new Error("ERROR: [BiliBili] BV1xx411c7mD: Unable to download webpage: HTTP Error 404: Not Found"),
    );
    await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    await vi.waitFor(() => {
      expect(useVideoStore.getState().items[0].importStatus).toBe("failed");
    });
    expect(useVideoStore.getState().items[0].importError).toMatch(/[\u4e00-\u9fff]/);
    expect(useVideoStore.getState().items[0].importError).not.toBe("解析失败，请检查链接后重试");
  });

  it("surfaces Chinese fetch-binaries guidance when a sidecar is missing", async () => {
    h.resolveVideo.mockRejectedValue(new Error("Error: No such file or directory (os error 2)"));
    await importVideo("https://www.bilibili.com/video/BV1xx411c7mD");
    await vi.waitFor(() => {
      expect(useVideoStore.getState().items[0].importStatus).toBe("failed");
    });
    expect(useVideoStore.getState().items[0].importError).toMatch(/fetch-binaries/);
    expect(useVideoStore.getState().items[0].importError).toMatch(/[\u4e00-\u9fff]/);
    expect(useVideoStore.getState().items[0].importError).not.toMatch(/os error|No such file/i);
  });
});
