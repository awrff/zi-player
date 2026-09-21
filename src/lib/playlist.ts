import type { Playlist, VideoItem } from "@/types";

export function nextPlaylistName(playlists: Pick<Playlist, "name">[]): string {
  const used = new Set(playlists.map((p) => p.name));
  let n = 1;
  while (used.has(`歌单 ${n}`)) n++;
  return `歌单 ${n}`;
}

export function newPlaylistId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function resolvePlaylistSongs(songIds: string[], items: VideoItem[]): VideoItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return songIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

export function playlistCoverUrls(songIds: string[], items: VideoItem[], limit = 4): string[] {
  const urls: string[] = [];
  for (const item of resolvePlaylistSongs(songIds, items)) {
    if (!item.cover) continue;
    urls.push(item.cover);
    if (urls.length >= limit) break;
  }
  return urls;
}