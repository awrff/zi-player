import { describe, expect, it, vi } from "vitest";
import type { Playlist, VideoItem } from "@/types";
import { buildTrackMenu } from "./trackContextMenu";

const item: VideoItem = {
  id: "BV1",
  url: "https://www.bilibili.com/video/BV1",
  title: "歌",
  uploader: "UP",
  duration: 10,
  cover: "x",
  addedAt: 1,
  cachePath: "data:audio/wav;base64,x",
  importStatus: "ready",
};

const playlists: Playlist[] = [{ id: "pl-1", name: "通勤", songIds: [], createdAt: 1, updatedAt: 1 }];

describe("buildTrackMenu", () => {
  it("adds a song to the chosen playlist", () => {
    const onAddToPlaylist = vi.fn();
    const menu = buildTrackMenu(item, false, {
      onToggle: () => {},
      onRename: () => {},
      playlists,
      onAddToPlaylist,
      onCreatePlaylistFor: () => {},
    });
    menu.onClick?.({ key: "pl:pl-1", keyPath: ["pl:pl-1"], item: {}, domEvent: { stopPropagation() {} } } as never);
    expect(onAddToPlaylist).toHaveBeenCalledWith(item, "pl-1");
  });

  it("opens a new playlist from the submenu", () => {
    const onCreatePlaylistFor = vi.fn();
    const menu = buildTrackMenu(item, false, {
      onToggle: () => {},
      onRename: () => {},
      onCreatePlaylistFor,
    });
    menu.onClick?.({ key: "new-playlist", keyPath: ["new-playlist"], item: {}, domEvent: { stopPropagation() {} } } as never);
    expect(onCreatePlaylistFor).toHaveBeenCalledWith(item);
  });

  it("disables play and offers retry when import failed", () => {
    const onRetry = vi.fn();
    const failed = { ...item, cachePath: undefined, importStatus: "failed" as const };
    const menu = buildTrackMenu(failed, false, {
      onToggle: () => {},
      onRetry,
      onRename: () => {},
    });
    const keys = (menu.items ?? []).map((entry) => (entry && "key" in entry ? entry.key : null));
    expect(keys).toContain("retry");
    const toggle = (menu.items ?? []).find((entry) => entry && "key" in entry && entry.key === "toggle") as {
      disabled?: boolean;
    };
    expect(toggle.disabled).toBe(true);
    menu.onClick?.({ key: "retry", keyPath: ["retry"], item: {}, domEvent: { stopPropagation() {} } } as never);
    expect(onRetry).toHaveBeenCalledWith(failed);
  });
});
