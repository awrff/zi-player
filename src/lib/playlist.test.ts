import { describe, expect, it } from "vitest";
import { nextPlaylistName, playlistCoverUrls, resolvePlaylistSongs } from "./playlist";
import type { Playlist, VideoItem } from "@/types";

function item(id: string, cover = `${id}.jpg`): VideoItem {
  return {
    id,
    url: `https://www.bilibili.com/video/${id}`,
    title: id,
    uploader: "UP",
    duration: 10,
    cover,
    addedAt: 1,
  };
}

describe("nextPlaylistName", () => {
  it("starts at 歌单 1 and skips taken names", () => {
    expect(nextPlaylistName([])).toBe("歌单 1");
    expect(nextPlaylistName([{ name: "歌单 1" }, { name: "通勤" }])).toBe("歌单 2");
    expect(nextPlaylistName([{ name: "歌单 1" }, { name: "歌单 2" }])).toBe("歌单 3");
  });
});

describe("resolvePlaylistSongs", () => {
  it("preserves playlist order and skips missing ids", () => {
    const items = [item("a"), item("b"), item("c")];
    expect(resolvePlaylistSongs(["c", "missing", "a"], items).map((i) => i.id)).toEqual(["c", "a"]);
  });
});

describe("playlistCoverUrls", () => {
  it("returns up to four covers in playlist order", () => {
    const items = [item("a"), item("b"), item("c"), item("d"), item("e")];
    const playlist: Pick<Playlist, "songIds"> = { songIds: ["e", "b", "a", "d", "c"] };
    expect(playlistCoverUrls(playlist.songIds, items)).toEqual(["e.jpg", "b.jpg", "a.jpg", "d.jpg"]);
  });
});
