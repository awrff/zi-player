import { Button, Dropdown } from "antd";
import {
  CheckSquareOutlined,
  DeleteOutlined,
  FolderAddOutlined,
  PlayCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import type { Playlist } from "@/types";

interface BatchActionBarProps {
  managing: boolean;
  selectedCount: number;
  allVisibleSelected: boolean;
  hasPlayable: boolean;
  playlists: Playlist[];
  currentPlaylistId: string | null;
  onEnter: () => void;
  onExit: () => void;
  onSelectAll: () => void;
  onClearVisible: () => void;
  onPlaySelected: () => void;
  onAddToQueue: () => void;
  onAddToPlaylist: (playlistId: string) => void;
  onCreatePlaylist: () => void;
  onRemoveFromPlaylist?: () => void;
  onDelete: () => void;
}

export function BatchActionBar({
  managing,
  selectedCount,
  allVisibleSelected,
  hasPlayable,
  playlists,
  currentPlaylistId,
  onEnter,
  onExit,
  onSelectAll,
  onClearVisible,
  onPlaySelected,
  onAddToQueue,
  onAddToPlaylist,
  onCreatePlaylist,
  onRemoveFromPlaylist,
  onDelete,
}: BatchActionBarProps) {
  if (!managing) {
    return (
      <Button
        data-testid="batch-manage"
        className="batch-manage"
        size="small"
        icon={<CheckSquareOutlined />}
        onClick={onEnter}
      >
        管理
      </Button>
    );
  }

  const none = selectedCount === 0;
  const addTargets = playlists.filter((playlist) => playlist.id !== currentPlaylistId);
  const addMenu: MenuProps = {
    items: [
      ...addTargets.map((playlist) => ({ key: playlist.id, label: playlist.name })),
      ...(addTargets.length > 0 ? [{ type: "divider" as const }] : []),
      { key: "new-playlist", label: "新建歌单" },
    ],
    onClick: ({ key }) => {
      if (key === "new-playlist") onCreatePlaylist();
      else onAddToPlaylist(key);
    },
  };

  return (
    <div className="batch-bar" data-testid="batch-bar">
      <Button size="small" onClick={allVisibleSelected ? onClearVisible : onSelectAll}>
        {allVisibleSelected ? "取消全选" : "全选"}
      </Button>
      <Button size="small" icon={<PlayCircleOutlined />} disabled={none || !hasPlayable} onClick={onPlaySelected}>
        播放选中
      </Button>
      <Button size="small" icon={<PlusOutlined />} disabled={none} onClick={onAddToQueue}>
        加入队列
      </Button>
      <Dropdown menu={addMenu} trigger={["click"]} disabled={none}>
        <Button size="small" icon={<FolderAddOutlined />} disabled={none}>
          添加到歌单
        </Button>
      </Dropdown>
      {onRemoveFromPlaylist ? (
        <Button size="small" disabled={none} onClick={onRemoveFromPlaylist}>
          从歌单移除
        </Button>
      ) : null}
      <Button size="small" danger icon={<DeleteOutlined />} disabled={none} onClick={onDelete}>
        删除
      </Button>
      <Button size="small" data-testid="batch-cancel" onClick={onExit}>
        取消
      </Button>
    </div>
  );
}
