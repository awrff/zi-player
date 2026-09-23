import { useCallback, useEffect, useMemo, useState } from "react";
import { App as AntApp, Button, ConfigProvider, Input, Modal, Segmented } from "antd";
import { AppstoreOutlined, PlusOutlined, SearchOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { theme } from "@/styles/theme";
import { useVideoStore } from "@/store/videoStore";
import { usePlayer } from "@/hooks/usePlayer";
import { useClipboardWatch } from "@/hooks/useClipboardWatch";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { useTrackSelection } from "@/hooks/useTrackSelection";
import { isPlayable } from "@/lib/importStatus";
import { nextPlaylistName, playlistCoverUrls, resolvePlaylistSongs } from "@/lib/playlist";
import { BatchActionBar } from "@/components/BatchActionBar";
import { Board } from "@/components/Board";
import { LibrarySidebar } from "@/components/LibrarySidebar";
import { PlayerBar } from "@/components/PlayerBar";
import { AddVideoModal } from "@/components/AddVideoModal";
import { ClipboardImportPrompt } from "@/components/ClipboardImportPrompt";
import { PlaylistCover } from "@/components/PlaylistCover";
import { PlaylistNameModal } from "@/components/PlaylistNameModal";
import { buildBatchTrackMenu } from "@/components/trackContextMenu";
import type { TrackSelectionView } from "@/components/trackSelection";
import { cancelImport, onImportFailed, resumeIncompleteImports, retryImport } from "@/lib/importer";
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
  const addManyToPlaylist = useVideoStore((s) => s.addManyToPlaylist);
  const removeFromPlaylist = useVideoStore((s) => s.removeFromPlaylist);
  const removeManyFromPlaylist = useVideoStore((s) => s.removeManyFromPlaylist);
  const removeManyVideos = useVideoStore((s) => s.removeManyVideos);
  const addToQueue = useVideoStore((s) => s.addToQueue);
  const moveInPlaylist = useVideoStore((s) => s.moveInPlaylist);
  const setSelectedLibrary = useVideoStore((s) => s.setSelectedLibrary);
  const setBoardView = useVideoStore((s) => s.setBoardView);

  const [addOpen, setAddOpen] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [nameModal, setNameModal] = useState<
    { mode: "create"; seedSongIds?: string[] } | { mode: "rename"; playlist: Playlist } | null
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

  useEffect(() => {
    resumeIncompleteImports();
  }, []);

  useEffect(() => onImportFailed((title, detail) => message.error(`「${title}」导入失败：${detail}`)), [message]);

  useClipboardWatch(setClipUrl);
  useAppUpdater();

  const currentPlaylist = selectedLibrary === "all" ? null : (playlists.find((p) => p.id === selectedLibrary) ?? null);
  const resolvedSelection: LibrarySelection = currentPlaylist ? currentPlaylist.id : "all";
  const scopedItems = currentPlaylist ? resolvePlaylistSongs(currentPlaylist.songIds, items) : items;
  const q = query.trim().toLowerCase();
  const visibleItems = q
    ? scopedItems.filter((i) => i.title.toLowerCase().includes(q) || i.uploader.toLowerCase().includes(q))
    : scopedItems;
  const visibleIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const selection = useTrackSelection(visibleIds);
  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selection.selectedSet.has(item.id)),
    [visibleItems, selection.selectedSet],
  );

  useEffect(() => {
    selection.exit();
  }, [resolvedSelection]);

  useEffect(() => {
    selection.prune(items.map((item) => item.id));
  }, [items]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.key === "Escape" && selection.managing) {
        selection.exit();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && visibleIds.length > 0) {
        event.preventDefault();
        selection.selectAllVisible();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toastPlaylistAdd = (name: string, added: number, skipped: number) => {
    if (added === 0) {
      message.warning("已在该歌单中");
      return;
    }
    if (skipped === 0) {
      message.success(added === 1 ? `已添加到「${name}」` : `已添加 ${added} 首到「${name}」`);
      return;
    }
    message.success(`已添加 ${added} 首到「${name}」，${skipped} 首已在歌单中`);
  };

  const toastQueueAdd = (added: number, skipped: number) => {
    if (added === 0) {
      message.warning("已在播放队列中");
      return;
    }
    if (skipped === 0) {
      message.success(added === 1 ? "已加入播放队列" : `已加入播放队列（${added} 首）`);
      return;
    }
    message.success(`已加入播放队列 ${added} 首，${skipped} 首已在队列中`);
  };

  const handleAddToPlaylist = (item: VideoItem, playlistId: string) => {
    const playlist = playlists.find((p) => p.id === playlistId);
    const result = addManyToPlaylist(playlistId, [item.id]);
    toastPlaylistAdd(playlist?.name ?? "歌单", result.added, result.skipped);
  };

  const handleAddManyToPlaylist = (playlistId: string, songIds: string[]) => {
    const playlist = playlists.find((p) => p.id === playlistId);
    const result = addManyToPlaylist(playlistId, songIds);
    toastPlaylistAdd(playlist?.name ?? "歌单", result.added, result.skipped);
  };

  const handleAddToQueue = (songIds: string[]) => {
    const result = addToQueue(songIds);
    toastQueueAdd(result.added, result.skipped);
  };

  const handleNameSubmit = (name: string) => {
    if (!nameModal) return;
    if (nameModal.mode === "rename") {
      renamePlaylist(nameModal.playlist.id, name);
      setNameModal(null);
      return;
    }
    const created = createPlaylist(name);
    if (created && nameModal.seedSongIds?.length) {
      const result = addManyToPlaylist(created.id, nameModal.seedSongIds);
      toastPlaylistAdd(created.name, result.added, result.skipped);
    }
    setNameModal(null);
  };

  const deleteFromLibrary = (ids: string[]) => {
    for (const id of ids) cancelImport(id);
    if (ids.length === 1) removeVideo(ids[0]);
    else removeManyVideos(ids);
  };

  const confirmDeleteMany = (ids: string[]) => {
    if (ids.length === 0) return;
    Modal.confirm({
      title: ids.length === 1 ? "删除这条记录？" : `删除 ${ids.length} 条记录？`,
      content: "会从资料库和所有歌单中移除。",
      okText: "删除",
      cancelText: "取消",
      onOk: () => deleteFromLibrary(ids),
    });
  };

  const handlePlaySelected = () => {
    void controls.playSelected(selectedItems).then((ok) => {
      if (!ok) message.warning("没有可播放的歌曲");
    });
  };

  const selectedIds = selectedItems.map((item) => item.id);
  const batchMenu = buildBatchTrackMenu({
    selectedCount: selectedItems.length,
    hasPlayable: selectedItems.some(isPlayable),
    playlists,
    currentPlaylistId: currentPlaylist?.id ?? null,
    onPlaySelected: handlePlaySelected,
    onAddToQueue: () => handleAddToQueue(selectedIds),
    onAddToPlaylist: (playlistId) => handleAddManyToPlaylist(playlistId, selectedIds),
    onCreatePlaylist: () => setNameModal({ mode: "create", seedSongIds: selectedIds }),
    onRemoveFromPlaylist: currentPlaylist
      ? () => {
          const removed = removeManyFromPlaylist(currentPlaylist.id, selectedIds);
          if (removed > 0) message.success(`已从歌单移除 ${removed} 首`);
        }
      : undefined,
    onDelete: () => confirmDeleteMany(selectedIds),
  });

  const selectionView: TrackSelectionView = {
    selecting: selection.managing,
    selectedIds: selection.selectedSet,
    batchMenu: selectedItems.length > 0 ? batchMenu : undefined,
    onSelectClick: (item, mods) => selection.onItemClick(item.id, mods),
    onSelectToggle: (item) => selection.toggle(item.id),
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
                <span className="library-heading-meta">
                  {visibleItems.length} 首
                  {selection.managing ? ` · ${selection.visibleSelectedIds.length} 已选` : ""}
                </span>
              </div>
            </div>
            <div className="library-heading-actions">
              {visibleItems.length > 0 ? (
                <BatchActionBar
                  managing={selection.managing}
                  selectedCount={selectedItems.length}
                  allVisibleSelected={selection.allVisibleSelected}
                  hasPlayable={selectedItems.some(isPlayable)}
                  playlists={playlists}
                  currentPlaylistId={currentPlaylist?.id ?? null}
                  onEnter={selection.enter}
                  onExit={selection.exit}
                  onSelectAll={selection.selectAllVisible}
                  onClearVisible={selection.clearVisible}
                  onPlaySelected={handlePlaySelected}
                  onAddToQueue={() => handleAddToQueue(selectedIds)}
                  onAddToPlaylist={(playlistId) => handleAddManyToPlaylist(playlistId, selectedIds)}
                  onCreatePlaylist={() => setNameModal({ mode: "create", seedSongIds: selectedIds })}
                  onRemoveFromPlaylist={
                    currentPlaylist
                      ? () => {
                          const removed = removeManyFromPlaylist(currentPlaylist.id, selectedIds);
                          if (removed > 0) message.success(`已从歌单移除 ${removed} 首`);
                        }
                      : undefined
                  }
                  onDelete={() => confirmDeleteMany(selectedIds)}
                />
              ) : null}
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
          </div>
          <Board
            items={visibleItems}
            playingId={currentId}
            playing={playing}
            viewMode={boardView}
            emptyKind={currentPlaylist ? "playlist" : "library"}
            selection={selectionView}
            onToggle={(item) => void controls.playFromList(item, scopedItems)}
            onRetry={(item) => retryImport(item.id)}
            onDelete={(item) => deleteFromLibrary([item.id])}
            onRename={renameVideo}
            playlists={playlists}
            onAddToPlaylist={handleAddToPlaylist}
            onAddToQueue={(item) => handleAddToQueue([item.id])}
            onCreatePlaylistFor={(item) => setNameModal({ mode: "create", seedSongIds: [item.id] })}
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
