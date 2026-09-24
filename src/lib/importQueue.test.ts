import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionEpisode, VideoMeta } from "@/types";

type ProgressCb = (event: { id: string; stage: "download" | "transcode"; percent?: number | null }) => void;

const h = vi.hoisted(() => ({
  resolveVideo: vi.fn(),
  fetchCover: vi.fn(),
  downloadAudio: vi.fn(),
  cancelImport: vi.fn(async () => {}),
  onImportProgress: vi.fn((_cb: unknown) => () => {}),
}));

vi.mock("./native", () => ({
  native: {
    isTauri: false,
    resolveVideo: h.resolveVideo,
    fetchCover: h.fetchCover,
    downloadAudio: h.downloadAudio,
    cancelImport: h.cancelImport,
    onImportProgress: h.onImportProgress,
  },
}));

import {
  cancelImport,
  enqueueEpisodes,
  enqueueImport,
  resetImportQueue,
  resumeIncompleteImports,
  retryImport,
  setImportConcurrency,
} from "./importQueue";
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
  h.cancelImport.mockReset();
  h.fetchCover.mockResolvedValue("");
  h.downloadAudio.mockResolvedValue("/data/audio/BV.ogg");
  useVideoStore.setState({ items: [], currentId: null, playing: false, playlists: [] });
});

describe("importQueue", () => {
  it("runs jobs one at a time with concurrency 1", async () => {
    setImportConcurrency(1);
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

  it("runs multiple jobs concurrently", async () => {
    setImportConcurrency(2);
    const gates: Array<() => void> = [];
    h.resolveVideo.mockImplementation(
      (url: string) =>
        new Promise<VideoMeta>((resolve) => {
          gates.push(() => resolve(meta(url.split("/").pop()!)));
        }),
    );

    enqueueImport("https://www.bilibili.com/video/BV1xx411c7mD");
    enqueueImport("https://www.bilibili.com/video/BV1xx411c7mE");
    await vi.waitFor(() => expect(h.resolveVideo).toHaveBeenCalledTimes(2));
    expect(useVideoStore.getState().items.every((item) => item.importStatus === "resolving")).toBe(true);

    for (const release of gates) release();
    await vi.waitFor(() => {
      expect(useVideoStore.getState().items.every((item) => item.importStatus === "ready")).toBe(true);
    });
  });

  it("does not start a second runJob for an active item on retryImport", async () => {
    h.resolveVideo.mockImplementation(() => new Promise<VideoMeta>(() => {}));

    enqueueImport("https://www.bilibili.com/video/BV1xx411c7mD");
    await vi.waitFor(() => expect(h.resolveVideo).toHaveBeenCalledTimes(1));

    retryImport("BV1xx411c7mD");
    await Promise.resolve();
    expect(h.resolveVideo).toHaveBeenCalledTimes(1);
  });

  it("consumes real progress events and retires the fallback timer", async () => {
    const calls = h.onImportProgress.mock.calls;
    const registered = calls[calls.length - 1]?.[0] as ProgressCb | undefined;
    expect(registered).toBeTypeOf("function");

    h.resolveVideo.mockResolvedValue(meta("BV1xx411c7mD"));
    h.downloadAudio.mockImplementation(() => new Promise(() => {}));
    enqueueImport("https://www.bilibili.com/video/BV1xx411c7mD");
    await vi.waitFor(() => expect(h.downloadAudio).toHaveBeenCalled());

    registered?.({ id: "BV1xx411c7mD", stage: "download", percent: 55 });
    const item = useVideoStore.getState().items[0];
    expect(item.importStatus).toBe("transcoding");
    expect(item.importProgress).toBe(55);

    // Events for ids that are not on the board are ignored.
    registered?.({ id: "BV-unknown", stage: "download", percent: 90 });
    expect(useVideoStore.getState().items[0].importProgress).toBe(55);
  });

  it("forwards cancel to the native layer", async () => {
    h.resolveVideo.mockImplementation(() => new Promise<VideoMeta>(() => {}));
    enqueueImport("https://www.bilibili.com/video/BV1xx411c7mD");
    await vi.waitFor(() => expect(h.resolveVideo).toHaveBeenCalled());

    cancelImport("BV1xx411c7mD");
    await vi.waitFor(() => expect(h.cancelImport).toHaveBeenCalledWith("BV1xx411c7mD"));
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

describe("enqueueEpisodes", () => {
  const pageEp = (page: number, title: string, duration: number): CollectionEpisode => ({
    index: page,
    bvid: "BV1gq4y167mq",
    page,
    title,
    duration,
  });

  beforeEach(() => {
    h.resolveVideo.mockReset();
    h.downloadAudio.mockReset();
    h.downloadAudio.mockResolvedValue("/data/audio/BV.ogg");
  });

  it("enqueues multi-P episodes as ?p=N jobs with prefilled metadata", async () => {
    h.resolveVideo.mockImplementation(async (url: string) => {
      const match = url.match(/video\/(BV\w+)\?p=(\d+)/)!;
      return meta(`${match[1]}_p${match[2]}`);
    });

    const result = enqueueEpisodes([pageEp(1, "p01 默", 295), pageEp(2, "p02 Melody", 254)]);
    expect(result).toEqual({ queued: 2, skipped: 0 });

    const items = useVideoStore.getState().items;
    expect(items.map((item) => item.id)).toEqual(["BV1gq4y167mq_p1", "BV1gq4y167mq_p2"]);
    expect(items.map((item) => item.title)).toEqual(["p01 默", "p02 Melody"]);
    expect(items.map((item) => item.duration)).toEqual([295, 254]);
    expect(h.resolveVideo).toHaveBeenCalledWith("https://www.bilibili.com/video/BV1gq4y167mq?p=1");

    await vi.waitFor(() => {
      expect(useVideoStore.getState().items.every((item) => item.importStatus === "ready")).toBe(true);
    });
  });

  it("skips episodes already on the board", async () => {
    h.resolveVideo.mockImplementation(async (url: string) => {
      const match = url.match(/video\/(BV\w+)\?p=(\d+)/)!;
      return meta(`${match[1]}_p${match[2]}`);
    });
    useVideoStore.getState().addVideo(meta("BV1gq4y167mq_p2"));

    const result = enqueueEpisodes([pageEp(1, "p01 默", 295), pageEp(2, "p02 Melody", 254)]);
    expect(result).toEqual({ queued: 1, skipped: 1 });
    expect(useVideoStore.getState().items).toHaveLength(2);
  });

  it("enqueues list episodes as plain BV jobs", async () => {
    h.resolveVideo.mockImplementation(async (url: string) => meta(url.split("/").pop()!));

    const result = enqueueEpisodes([
      { index: 1, bvid: "BV1KKFSzYERF", title: "懒人必看", duration: 182 },
      { index: 2, bvid: "BV1abc0000000", title: "第二集", duration: 60 },
    ]);
    expect(result).toEqual({ queued: 2, skipped: 0 });
    expect(useVideoStore.getState().items.map((item) => item.id)).toEqual(["BV1KKFSzYERF", "BV1abc0000000"]);

    await vi.waitFor(() => {
      expect(useVideoStore.getState().items.every((item) => item.importStatus === "ready")).toBe(true);
    });
  });
});
