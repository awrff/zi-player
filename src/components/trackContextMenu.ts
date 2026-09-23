import { Modal } from "antd";
import type { MenuProps } from "antd";
import { isPlayable, normalizeImportStatus } from "@/lib/importStatus";
import type { Playlist, VideoItem } from "@/types";

export interface TrackMenuHandlers {
  onToggle: (item: VideoItem) => void;
  onRetry?: (item: VideoItem) => void;
  onRename: (item: VideoItem) => void;
  onDelete?: (item: VideoItem) => void;
  onRemoveFromPlaylist?: (item: VideoItem) => void;
  onMoveUp?: (item: VideoItem) => void;
  onMoveDown?: (item: VideoItem) => void;
  onAddToPlaylist?: (item: VideoItem, playlistId: string) => void;
  onCreatePlaylistFor?: (item: VideoItem) => void;
  onAddToQueue?: (item: VideoItem) => void;
  playlists?: Playlist[];
}

export interface BatchTrackMenuHandlers {
  selectedCount: number;
  hasPlayable?: boolean;
  playlists?: Playlist[];
  currentPlaylistId?: string | null;
  onPlaySelected?: () => void;
  onAddToQueue?: () => void;
  onAddToPlaylist?: (playlistId: string) => void;
  onCreatePlaylist?: () => void;
  onRemoveFromPlaylist?: () => void;
  onDelete?: () => void;
}

function playlistChildren(
  playlists: Playlist[] | undefined,
  currentPlaylistId: string | null | undefined,
  includeCreate: boolean,
): NonNullable<MenuProps["items"]> {
  const children: NonNullable<MenuProps["items"]> = (playlists ?? [])
    .filter((playlist) => playlist.id !== currentPlaylistId)
    .map((playlist) => ({
      key: `pl:${playlist.id}`,
      label: playlist.name,
    }));
  if (includeCreate) {
    if (children.length > 0) children.push({ type: "divider" });
    children.push({ key: "new-playlist", label: "新建歌单" });
  }
  return children;
}

export function buildTrackMenu(item: VideoItem, playing: boolean, handlers: TrackMenuHandlers): MenuProps {
  const playable = isPlayable(item);
  const status = normalizeImportStatus(item);
  const items: NonNullable<MenuProps["items"]> = [
    {
      key: "toggle",
      label: playing ? "暂停" : status === "failed" ? "无法播放" : playable ? "播放" : "导入中",
      disabled: !playing && !playable,
    },
  ];
  if (status === "failed" && handlers.onRetry) {
    items.push({ key: "retry", label: "重试" });
  }

  if (handlers.onAddToPlaylist || handlers.onCreatePlaylistFor) {
    items.push({
      key: "add-to",
      label: "添加到歌单",
      children: playlistChildren(handlers.playlists, undefined, Boolean(handlers.onCreatePlaylistFor)),
    });
  }

  if (handlers.onAddToQueue) {
    items.push({ key: "queue", label: "加入播放队列" });
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
      if (key === "retry") handlers.onRetry?.(item);
      if (key === "rename") handlers.onRename(item);
      if (key === "move-up") handlers.onMoveUp?.(item);
      if (key === "move-down") handlers.onMoveDown?.(item);
      if (key === "remove") handlers.onRemoveFromPlaylist?.(item);
      if (key === "queue") handlers.onAddToQueue?.(item);
      if (key === "new-playlist") handlers.onCreatePlaylistFor?.(item);
      if (key.startsWith("pl:")) handlers.onAddToPlaylist?.(item, key.slice(3));
      if (key === "delete" && handlers.onDelete) {
        Modal.confirm({
          title: "删除这条记录？",
          content: "会从资料库和所有歌单中移除。",
          okText: "删除",
          cancelText: "取消",
          onOk: () => handlers.onDelete?.(item),
        });
      }
    },
  };
}

export function buildBatchTrackMenu(handlers: BatchTrackMenuHandlers): MenuProps {
  const count = handlers.selectedCount;
  const items: NonNullable<MenuProps["items"]> = [
    {
      key: "play",
      label: `播放选中（${count}）`,
      disabled: !handlers.hasPlayable || !handlers.onPlaySelected,
    },
  ];

  if (handlers.onAddToQueue) {
    items.push({ key: "queue", label: "加入播放队列" });
  }

  if (handlers.onAddToPlaylist || handlers.onCreatePlaylist) {
    items.push({
      key: "add-to",
      label: "添加到歌单",
      children: playlistChildren(handlers.playlists, handlers.currentPlaylistId, Boolean(handlers.onCreatePlaylist)),
    });
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
      if (key === "play") handlers.onPlaySelected?.();
      if (key === "queue") handlers.onAddToQueue?.();
      if (key === "remove") handlers.onRemoveFromPlaylist?.();
      if (key === "delete") handlers.onDelete?.();
      if (key === "new-playlist") handlers.onCreatePlaylist?.();
      if (key.startsWith("pl:")) handlers.onAddToPlaylist?.(key.slice(3));
    },
  };
}
