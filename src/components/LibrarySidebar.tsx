import { Dropdown } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { LibrarySelection, Playlist, VideoItem } from "@/types";
import { playlistCoverUrls } from "@/lib/playlist";
import { PlaylistCover } from "./PlaylistCover";

interface LibrarySidebarProps {
  itemCount: number;
  playlists: Playlist[];
  items: VideoItem[];
  selectedLibrary: LibrarySelection;
  onSelect: (id: LibrarySelection) => void;
  onCreate: () => void;
  onRename: (playlist: Playlist) => void;
  onDelete: (playlist: Playlist) => void;
}

export function LibrarySidebar({
  itemCount,
  playlists,
  items,
  selectedLibrary,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: LibrarySidebarProps) {
  return (
    <aside className="library-sidebar" data-testid="library-sidebar">
      <div className="library-section">
        <p className="library-section-title">资料库</p>
        <button
          type="button"
          className={["library-item", selectedLibrary === "all" ? "is-active" : ""].filter(Boolean).join(" ")}
          data-testid="library-all"
          onClick={() => onSelect("all")}
        >
          <span className="library-item-name">全部歌曲</span>
          <span className="library-item-count">{itemCount}</span>
        </button>
      </div>
      <div className="library-section">
        <div className="library-section-head">
          <p className="library-section-title">歌单</p>
          <button
            type="button"
            className="library-section-add"
            data-testid="library-new-playlist"
            title="新建歌单"
            aria-label="新建歌单"
            onClick={onCreate}
          >
            <PlusOutlined />
          </button>
        </div>
        {playlists.map((playlist) => (
          <Dropdown
            key={playlist.id}
            trigger={["contextMenu"]}
            menu={{
              items: [
                { key: "rename", label: "重命名" },
                { key: "delete", label: "删除", danger: true },
              ],
              onClick: ({ key }) => {
                if (key === "rename") onRename(playlist);
                if (key === "delete") onDelete(playlist);
              },
            }}
          >
            <button
              type="button"
              className={["library-item", selectedLibrary === playlist.id ? "is-active" : ""].filter(Boolean).join(" ")}
              data-testid="library-playlist"
              data-id={playlist.id}
              onClick={() => onSelect(playlist.id)}
            >
              <PlaylistCover covers={playlistCoverUrls(playlist.songIds, items)} size={32} />
              <span className="library-item-name">{playlist.name}</span>
              <span className="library-item-count">{playlist.songIds.length}</span>
            </button>
          </Dropdown>
        ))}
      </div>
    </aside>
  );
}
