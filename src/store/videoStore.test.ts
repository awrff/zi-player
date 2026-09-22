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
  useVideoStore.setState({
    items: [],
    playlists: [],
    selectedLibrary: "all",
    boardView: "grid",
    currentId: null,
    playing: false,
    queueIds: [],
    shuffleOrder: null,
    shuffle: false,
    repeat: "off",
  });
});

describe("videoStore", () => {
  it("adds a video with metadata", () => {
    const item = useVideoStore.getState().addVideo(meta("BV1"));
    expect(item).not.toBeNull();
    expect(item!.title).toBe("标题-BV1");
    expect(item!.addedAt).toBeGreaterThan(0);
    expect(item!.importStatus).toBe("queued");
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

  it("marks reusable ogg caches as ready", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    useVideoStore.getState().setCachePath("BV1", "/data/audio/BV1.ogg");
    expect(useVideoStore.getState().items[0].importStatus).toBe("ready");
  });

  it("replaces a short-link id after resolve", () => {
    useVideoStore.getState().addVideo({
      ...meta("AbCdEf"),
      url: "https://b23.tv/AbCdEf",
    });
    expect(useVideoStore.getState().replaceVideoId("AbCdEf", "BV1real")).toBe(true);
    expect(useVideoStore.getState().items[0].id).toBe("BV1real");
    expect(useVideoStore.getState().replaceVideoId("missing", "BV2")).toBe(false);
  });
});

describe("videoStore playlists", () => {
  it("creates a playlist with a default name and selects it", () => {
    const first = useVideoStore.getState().createPlaylist();
    expect(first).not.toBeNull();
    expect(first!.name).toBe("歌单 1");
    expect(useVideoStore.getState().selectedLibrary).toBe(first!.id);

    const second = useVideoStore.getState().createPlaylist();
    expect(second!.name).toBe("歌单 2");
  });

  it("rejects a blank playlist name", () => {
    expect(useVideoStore.getState().createPlaylist("   ")).toBeNull();
    expect(useVideoStore.getState().playlists).toHaveLength(0);
  });

  it("renames a playlist", () => {
    const playlist = useVideoStore.getState().createPlaylist("草稿")!;
    expect(useVideoStore.getState().renamePlaylist(playlist.id, "通勤")).toBe(true);
    expect(useVideoStore.getState().playlists[0].name).toBe("通勤");
    expect(useVideoStore.getState().renamePlaylist(playlist.id, "  ")).toBe(false);
  });

  it("deletes a playlist and returns to the library", () => {
    const playlist = useVideoStore.getState().createPlaylist("临时")!;
    useVideoStore.getState().deletePlaylist(playlist.id);
    expect(useVideoStore.getState().playlists).toHaveLength(0);
    expect(useVideoStore.getState().selectedLibrary).toBe("all");
  });

  it("adds a song once and rejects duplicates", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    const playlist = useVideoStore.getState().createPlaylist("通勤")!;
    expect(useVideoStore.getState().addToPlaylist(playlist.id, "BV1")).toBe(true);
    expect(useVideoStore.getState().addToPlaylist(playlist.id, "BV1")).toBe(false);
    expect(useVideoStore.getState().addToPlaylist(playlist.id, "missing")).toBe(false);
    expect(useVideoStore.getState().playlists[0].songIds).toEqual(["BV1"]);
  });

  it("removes a song from a playlist without deleting the library item", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    const playlist = useVideoStore.getState().createPlaylist("通勤")!;
    useVideoStore.getState().addToPlaylist(playlist.id, "BV1");
    useVideoStore.getState().removeFromPlaylist(playlist.id, "BV1");
    expect(useVideoStore.getState().playlists[0].songIds).toEqual([]);
    expect(useVideoStore.getState().items).toHaveLength(1);
  });

  it("reorders songs inside a playlist", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    useVideoStore.getState().addVideo(meta("BV2"));
    useVideoStore.getState().addVideo(meta("BV3"));
    const playlist = useVideoStore.getState().createPlaylist("通勤")!;
    useVideoStore.getState().addToPlaylist(playlist.id, "BV1");
    useVideoStore.getState().addToPlaylist(playlist.id, "BV2");
    useVideoStore.getState().addToPlaylist(playlist.id, "BV3");
    useVideoStore.getState().moveInPlaylist(playlist.id, "BV3", 0);
    expect(useVideoStore.getState().playlists[0].songIds).toEqual(["BV3", "BV1", "BV2"]);
  });

  it("snapshots a queue and rebuilds shuffle order around the playing track", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    useVideoStore.getState().addVideo(meta("BV2"));
    useVideoStore.getState().addVideo(meta("BV3"));
    useVideoStore.getState().setShuffle(true);
    useVideoStore.getState().setQueue(["BV1", "BV2", "BV3"], "BV2");
    expect(useVideoStore.getState().queueIds).toEqual(["BV1", "BV2", "BV3"]);
    expect(useVideoStore.getState().shuffleOrder?.[0]).toBe("BV2");
    expect(useVideoStore.getState().shuffleOrder).toHaveLength(3);

    useVideoStore.getState().setShuffle(false);
    expect(useVideoStore.getState().shuffleOrder).toBeNull();
  });

  it("removes a library item from the play queue", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    useVideoStore.getState().addVideo(meta("BV2"));
    useVideoStore.getState().setQueue(["BV1", "BV2"], "BV1");
    useVideoStore.getState().setCurrent("BV1");
    useVideoStore.getState().removeVideo("BV1");
    expect(useVideoStore.getState().queueIds).toEqual(["BV2"]);
    expect(useVideoStore.getState().currentId).toBeNull();
  });

  it("strips a deleted video from every playlist", () => {
    useVideoStore.getState().addVideo(meta("BV1"));
    const one = useVideoStore.getState().createPlaylist("A")!;
    const two = useVideoStore.getState().createPlaylist("B")!;
    useVideoStore.getState().addToPlaylist(one.id, "BV1");
    useVideoStore.getState().addToPlaylist(two.id, "BV1");
    useVideoStore.getState().removeVideo("BV1");
    expect(useVideoStore.getState().playlists.map((p) => p.songIds)).toEqual([[], []]);
  });
});
