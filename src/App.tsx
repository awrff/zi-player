import { useCallback, useEffect, useState } from "react";
import { App as AntApp, Button, ConfigProvider, Input, Modal, Segmented } from "antd";
import { AppstoreOutlined, PlusOutlined, SearchOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { theme } from "@/styles/theme";
import { useVideoStore } from "@/store/videoStore";
import { usePlayer } from "@/hooks/usePlayer";
import { useClipboardWatch } from "@/hooks/useClipboardWatch";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { nextPlaylistName, playlistCoverUrls, resolvePlaylistSongs } from "@/lib/playlist";
import { Board } from "@/components/Board";
import { LibrarySidebar } from "@/components/LibrarySidebar";
import { PlayerBar } from "@/components/PlayerBar";
import { AddVideoModal } from "@/components/AddVideoModal";
import { ClipboardImportPrompt } from "@/components/ClipboardImportPrompt";
import { PlaylistCover } from "@/components/PlaylistCover";
import { PlaylistNameModal } from "@/components/PlaylistNameModal";
import { native } from "@/lib/native";
import { SIDECAR_GUIDANCE } from "@/lib/sidecarError";
import type { BoardViewMode, LibrarySelection, Playlist, VideoItem } from "@/types";
import "./styles/global.css";

function BoardApp() {
  const { message } = AntApp.useApp();
  const items = useVideoStore((s) => s.items);
  const playlists = useVideoStore((s) => s.playlists);
  const selectedLibrary = useVideoStore((s) => s.selectedLibrary);
  const boardView = useVideoStore((s) => s.boardView);
  const currentId = useVideoStore((s) => s.currentId);
  const playing = useVideoStore((s) => s.playing);
  const removeVideo = useVideoStore((s) => s.removeVideo);
  const renameVideo = useVideoStore((s) => s.renameVideo);
  const createPlaylist = useVideoStore((s) => s.createPlaylist);
  const renamePlaylist = useVideoStore((s) => s.renamePlaylist);
  const deletePlaylist = useVideoStore((s) => s.deletePlaylist);
  const addToPlaylist = useVideoStore((s) => s.addToPlaylist);
  const removeFromPlaylist = useVideoStore((s) => s.removeFromPlaylist);
  const moveInPlaylist = useVideoStore((s) => s.moveInPlaylist);
  const setSelectedLibrary = useVideoStore((s) => s.setSelectedLibrary);
  const setBoardView = useVideoStore((s) => s.setBoardView);

  const [addOpen, setAddOpen] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [nameModal, setNameModal] = useState<
    { mode: "create"; seedSongId?: string } | { mode: "rename"; playlist: Playlist } | null
  >(null);

  const onError = useCallback((msg: string) => message.error(msg), [message]);
  const controls = usePlayer(onError);

  useEffect(() => {
    void native
      .checkSidecars()
      .then((missing) => {
        if (missing.length > 0) message.error(SIDECAR_GUIDANCE);
      })
      .catch(() => {
        // ponytail: browser / old builds without the command should stay quiet
      });
  }, [message]);

  useClipboardWatch(setClipUrl);
  useAppUpdater();

  const currentPlaylist = selectedLibrary === "all" ? null : (playlists.find((p) => p.id === selectedLibrary) ?? null);
  const resolvedSelection: LibrarySelection = currentPlaylist ? currentPlaylist.id : "all";
  const scopedItems = currentPlaylist ? resolvePlaylistSongs(currentPlaylist.songIds, items) : items;
  const q = query.trim().toLowerCase();
  const visibleItems = q
    ? scopedItems.filter((i) => i.title.toLowerCase().includes(q) || i.uploader.toLowerCase().includes(q))
    : scopedItems;

  const handleAddToPlaylist = (item: VideoItem, playlistId: string) => {
    const playlist = playlists.find((p) => p.id === playlistId);
    if (addToPlaylist(playlistId, item.id)) {
      message.success(`已添加到「${playlist?.name ?? "歌单"}」`);
    } else {
      message.warning("已在该歌单中");
    }
  };

  const handleNameSubmit = (name: string) => {
    if (!nameModal) return;
    if (nameModal.mode === "rename") {
      renamePlaylist(nameModal.playlist.id, name);
      setNameModal(null);
      return;
    }
    const created = createPlaylist(name);
    if (created && nameModal.seedSongId) {
      addToPlaylist(created.id, nameModal.seedSongId);
      message.success(`已添加到「${created.name}」`);
    }
    setNameModal(null);
  };

  const confirmDeletePlaylist = (playlist: Playlist) => {
    Modal.confirm({
      title: `删除歌单「${playlist.name}」？`,
      content: "歌曲仍会留在资料库里。",
      okText: "删除",
      cancelText: "取消",
      onOk: () => deletePlaylist(playlist.id),
    });
  };

  return (
    <div className="app-shell">
      <header className="app-toolbar">
        <h1 className="app-title">
          ZI <span className="accent">Player</span>
        </h1>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: "var(--text-dim)" }} />}
          placeholder="搜索歌曲"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 220 }}
          aria-label="search-input"
        />
        <div className="toolbar-spacer" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          添加
        </Button>
      </header>

      <div className="app-body">
        <LibrarySidebar
          itemCount={items.length}
          playlists={playlists}
          items={items}
          selectedLibrary={resolvedSelection}
          onSelect={setSelectedLibrary}
          onCreate={() => setNameModal({ mode: "create" })}
          onRename={(playlist) => setNameModal({ mode: "rename", playlist })}
          onDelete={confirmDeletePlaylist}
        />
        <div className="app-main">
          <div className="library-heading" data-testid="library-heading">
            <div className="library-heading-main">
              {currentPlaylist ? (
                <PlaylistCover covers={playlistCoverUrls(currentPlaylist.songIds, items)} size={56} />
              ) : null}
              <div className="library-heading-text">
                <h2>{currentPlaylist ? currentPlaylist.name : "全部歌曲"}</h2>
                <span className="library-heading-meta">{visibleItems.length} 首</span>
              </div>
            </div>
            <Segmented
              data-testid="board-view-toggle"
              size="small"
              value={boardView}
              onChange={(value) => setBoardView(value as BoardViewMode)}
              options={[
                { value: "grid", icon: <AppstoreOutlined />, label: "网格" },
                { value: "list", icon: <UnorderedListOutlined />, label: "列表" },
              ]}
            />
          </div>
          <Board
            items={visibleItems}
            playingId={currentId}
            playing={playing}
            viewMode={boardView}
            emptyKind={currentPlaylist ? "playlist" : "library"}
            onToggle={(item) => void controls.playFromList(item, scopedItems)}
            onDelete={currentPlaylist ? undefined : (item) => removeVideo(item.id)}
            onRename={renameVideo}
            playlists={playlists}
            onAddToPlaylist={handleAddToPlaylist}
            onCreatePlaylistFor={(item) => setNameModal({ mode: "create", seedSongId: item.id })}
            onRemoveFromPlaylist={
              currentPlaylist ? (item) => removeFromPlaylist(currentPlaylist.id, item.id) : undefined
            }
            onMove={
              currentPlaylist
                ? (item, dir) => {
                    const index = currentPlaylist.songIds.indexOf(item.id);
                    if (index < 0) return;
                    moveInPlaylist(currentPlaylist.id, item.id, index + dir);
                  }
                : undefined
            }
          />
        </div>
      </div>

      <PlayerBar controls={controls} />

      <AddVideoModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ClipboardImportPrompt url={clipUrl} onClose={() => setClipUrl(null)} />
      <PlaylistNameModal
        open={nameModal !== null}
        title={nameModal?.mode === "rename" ? "重命名歌单" : "新建歌单"}
        initialName={
          nameModal?.mode === "rename" ? nameModal.playlist.name : nextPlaylistName(playlists)
        }
        onSubmit={handleNameSubmit}
        onClose={() => setNameModal(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <AntApp>
        <BoardApp />
      </AntApp>
    </ConfigProvider>
  );
}
