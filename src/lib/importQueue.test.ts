import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoMeta } from "@/types";

const h = vi.hoisted(() => ({
  resolveVideo: vi.fn(),
  fetchCover: vi.fn(),
  downloadAudio: vi.fn(),
}));

vi.mock("./native", () => ({
  native: {
    isTauri: false,
    resolveVideo: h.resolveVideo,
    fetchCover: h.fetchCover,
    downloadAudio: h.downloadAudio,
  },
}));

import { cancelImport, enqueueImport, resetImportQueue, resumeIncompleteImports, retryImport } from "./importQueue";
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
  h.fetchCover.mockResolvedValue("");
  h.downloadAudio.mockResolvedValue("/data/audio/BV.ogg");
  useVideoStore.setState({ items: [], currentId: null, playing: false, playlists: [] });
});

describe("importQueue", () => {
  it("runs jobs one at a time", async () => {
    const order: string[] = [];
    h.resolveVideo.mockImplementation(async (url: string) => {
      const id = url.split("/").pop()!;
      order.push(`resolve:${id}`);
      return meta(id);
    });
    h.downloadAudio.mockImplementation(async (id: string) => {
      order.push(`download:${id}`);
      return `/data/audio/${id}.ogg`;
    });

    enqueueImport("https://www.bilibili.com/video/BV1xx411c7mD");
    enqueueImport("https://www.bilibili.com/video/BV1xx411c7mE");

    await vi.waitFor(() => {
      expect(useVideoStore.getState().items.every((item) => item.importStatus === "ready")).toBe(true);
    });
    expect(order).toEqual([
      "resolve:BV1xx411c7mD",
      "download:BV1xx411c7mD",
      "resolve:BV1xx411c7mE",
      "download:BV1xx411c7mE",
    ]);
  });

  it("discards work when the item is deleted", async () => {
    let finish!: (meta: VideoMeta) => void;
    h.resolveVideo.mockImplementation(() => new Promise<VideoMeta>((resolve) => {
      finish = resolve;
    }));

    enqueueImport("https://www.bilibili.com/video/BV1xx411c7mD");
    await vi.waitFor(() => expect(h.resolveVideo).toHaveBeenCalled());
    cancelImport("BV1xx411c7mD");
    useVideoStore.getState().removeVideo("BV1xx411c7mD");
    finish(meta("BV1xx411c7mD"));

    await Promise.resolve();
    await Promise.resolve();
    expect(h.downloadAudio).not.toHaveBeenCalled();
    expect(useVideoStore.getState().items).toHaveLength(0);
  });

  it("retries a failed item", async () => {
    h.resolveVideo.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(meta("BV1xx411c7mD"));
    enqueueImport("https://www.bilibili.com/video/BV1xx411c7mD");
    await vi.waitFor(() => {
      expect(useVideoStore.getState().items[0].importStatus).toBe("failed");
    });
    retryImport("BV1xx411c7mD");
    await vi.waitFor(() => {
      expect(useVideoStore.getState().items[0].importStatus).toBe("ready");
    });
  });

  it("resumes incomplete items", async () => {
    h.resolveVideo.mockResolvedValue(meta("BV1xx411c7mD"));
    useVideoStore.getState().addVideo(meta("BV1xx411c7mD"));
    useVideoStore.getState().setImportState("BV1xx411c7mD", { status: "queued", progress: 0 });
    resumeIncompleteImports();
    await vi.waitFor(() => {
      expect(useVideoStore.getState().items[0].importStatus).toBe("ready");
    });
  });
});
