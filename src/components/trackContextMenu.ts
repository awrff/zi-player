import { Modal } from "antd";
import type { MenuProps } from "antd";
import type { Playlist, VideoItem } from "@/types";

export interface TrackMenuHandlers {
  onToggle: (item: VideoItem) => void;
  onRename: (item: VideoItem) => void;
  onDelete?: (item: VideoItem) => void;
  onRemoveFromPlaylist?: (item: VideoItem) => void;
  onMoveUp?: (item: VideoItem) => void;
  onMoveDown?: (item: VideoItem) => void;
  onAddToPlaylist?: (item: VideoItem, playlistId: string) => void;
  onCreatePlaylistFor?: (item: VideoItem) => void;
  playlists?: Playlist[];
}

export function buildTrackMenu(item: VideoItem, playing: boolean, handlers: TrackMenuHandlers): MenuProps {
  const items: NonNullable<MenuProps["items"]> = [{ key: "toggle", label: playing ? "暂停" : "播放" }];

  if (handlers.onAddToPlaylist || handlers.onCreatePlaylistFor) {
    const children: NonNullable<MenuProps["items"]> = (handlers.playlists ?? []).map((playlist) => ({
      key: `pl:${playlist.id}`,
      label: playlist.name,
    }));
    if (handlers.onCreatePlaylistFor) {
      if (children.length > 0) children.push({ type: "divider" });
      children.push({ key: "new-playlist", label: "新建歌单" });
    }
    items.push({ key: "add-to", label: "添加到歌单", children });
  }

  items.push({ key: "rename", label: "重命名" });

  if (handlers.onMoveUp || handlers.onMoveDown) {
    items.push(
      { key: "move-up", label: "上移", disabled: !handlers.onMoveUp },
      { key: "move-down", label: "下移", disabled: !handlers.onMoveDown },
    );
  }

  if (handlers.onRemoveFromPlaylist) {
    items.push({ key: "remove", label: "从歌单移除" });
  }

  if (handlers.onDelete) {
    items.push({ key: "delete", label: "删除", danger: true });
  }

  return {
    items,
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation();
      if (key === "toggle") handlers.onToggle(item);
      if (key === "rename") handlers.onRename(item);
      if (key === "move-up") handlers.onMoveUp?.(item);
      if (key === "move-down") handlers.onMoveDown?.(item);
      if (key === "remove") handlers.onRemoveFromPlaylist?.(item);
      if (key === "new-playlist") handlers.onCreatePlaylistFor?.(item);
      if (key.startsWith("pl:")) handlers.onAddToPlaylist?.(item, key.slice(3));
      if (key === "delete" && handlers.onDelete) {
        Modal.confirm({
          title: "删除这条记录？",
          okText: "删除",
          cancelText: "取消",
          onOk: () => handlers.onDelete?.(item),
        });
      }
    },
  };
}
