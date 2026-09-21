import { beforeEach, describe, expect, it } from "vitest";
import { useVideoStore } from "./videoStore";
import type { VideoMeta } from "@/types";

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
  useVideoStore.setState({ items: [], currentId: null, playing: false });
});

describe("videoStore", () => {
  it("adds a video with metadata", () => {
    const item = useVideoStore.getState().addVideo(meta("BV1"));
    expect(item).not.toBeNull();
    expect(item!.title).toBe("标题-BV1");
    expect(item!.addedAt).toBeGreaterThan(0);
    expect(useVideoStore.getState().items).toHaveLength(1);
  });

  it("rejects duplicates by id", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    const again = useVideoStore.getState().addVideo(meta("BV1"));
    expect(again).toBeNull();
    expect(useVideoStore.getState().items).toHaveLength(1);
  });

  it("renames a video", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    useVideoStore.getState().renameVideo("BV1", "新名字");
    expect(useVideoStore.getState().items[0].title).toBe("新名字");
  });

  it("removes a video and clears the current track", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    useVideoStore.getState().setCurrent("BV1");
    useVideoStore.getState().removeVideo("BV1");
    expect(useVideoStore.getState().items).toHaveLength(0);
    expect(useVideoStore.getState().currentId).toBeNull();
    expect(useVideoStore.getState().playing).toBe(false);
  });

  it("setCurrent starts playing; setPlaying toggles pause", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    useVideoStore.getState().setCurrent("BV1");
    expect(useVideoStore.getState().currentId).toBe("BV1");
    expect(useVideoStore.getState().playing).toBe(true);

    useVideoStore.getState().setPlaying(false);
    expect(useVideoStore.getState().currentId).toBe("BV1");
    expect(useVideoStore.getState().playing).toBe(false);
  });

  it("tracks cached paths", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    useVideoStore.getState().setCachePath("BV1", "mock://audio/BV1.m4a");
    expect(useVideoStore.getState().items[0].cachePath).toBe("mock://audio/BV1.m4a");
  });
});
