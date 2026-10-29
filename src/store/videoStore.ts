import { create } from "zustand";
import { persist } from "zustand/middleware";
import { durableImportStatus, isReusableAudioCache } from "@/lib/importStatus";
import { newPlaylistId, nextPlaylistName } from "@/lib/playlist";
import { shuffledOrder } from "@/lib/playQueue";
import type { BoardViewMode, ImportStatus, LibrarySelection, Playlist, RepeatMode, VideoItem, VideoMeta } from "@/types";

export interface VideoState {
  items: VideoItem[];
  playlists: Playlist[];
  selectedLibrary: LibrarySelection;
  boardView: BoardViewMode;
  /** Id of the active track (kept even while paused). */
  currentId: string | null;
  /** Whether the active track is currently playing (spinning). */
  playing: boolean;
  /** Snapshot of song ids for the current play session. */
  queueIds: string[];
  /** Shuffled walk order; null when shuffle is off. */
  shuffleOrder: string[] | null;
  shuffle: boolean;
  repeat: RepeatMode;

  addVideo: (meta: VideoMeta) => VideoItem | null;
  removeVideo: (id: string) => void;
  renameVideo: (id: string, title: string) => void;
  setCachePath: (id: string, path: string) => void;
  patchVideo: (id: string, patch: Partial<Omit<VideoItem, "id">>) => void;
  replaceVideoId: (fromId: string, toId: string) => boolean;
  setImportState: (id: string, state: { status: ImportStatus; progress?: number; error?: string }) => void;
  has: (id: string) => boolean;

  createPlaylist: (name?: string) => Playlist | null;
  renamePlaylist: (id: string, name: string) => boolean;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, songId: string) => boolean;
  addManyToPlaylist: (playlistId: string, songIds: string[]) => { added: number; skipped: number };
  removeFromPlaylist: (playlistId: string, songId: string) => void;
  removeManyFromPlaylist: (playlistId: string, songIds: string[]) => number;
  removeManyVideos: (ids: string[]) => void;
  moveInPlaylist: (playlistId: string, songId: string, toIndex: number) => void;
  setSelectedLibrary: (id: LibrarySelection) => void;
  setBoardView: (mode: BoardViewMode) => void;

  setQueue: (ids: string[], playingId?: string | null) => void;
  addToQueue: (ids: string[]) => { added: number; skipped: number };
  setShuffle: (shuffle: boolean) => void;
  setRepeat: (repeat: RepeatMode) => void;
  removeFromQueue: (id: string) => void;

  /** Set the active track (and start playing it). */
  setCurrent: (id: string | null) => void;
  /** Pause/resume the active track. */
  setPlaying: (playing: boolean) => void;
}

function stripSongs(playlists: Playlist[], songIds: Set<string>): Playlist[] {
  return playlists.map((playlist) =>
    playlist.songIds.some((id) => songIds.has(id))
      ? { ...playlist, songIds: playlist.songIds.filter((id) => !songIds.has(id)), updatedAt: Date.now() }
      : playlist,
  );
}

function stripSong(playlists: Playlist[], songId: string): Playlist[] {
  return stripSongs(playlists, new Set([songId]));
}

export const useVideoStore = create<VideoState>()(
  persist(
    (set, get) => ({
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

      addVideo: (meta) => {
        if (get().has(meta.id)) return null;
        const item: VideoItem = {
          ...meta,
          addedAt: Date.now(),
          importStatus: "queued",
          importProgress: 0,
        };
        set((state) => ({ items: [...state.items, item] }));
        return item;
      },

      removeVideo: (id) => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
          playlists: stripSong(state.playlists, id),
          queueIds: state.queueIds.filter((songId) => songId !== id),
          shuffleOrder: state.shuffleOrder?.filter((songId) => songId !== id) ?? null,
          currentId: state.currentId === id ? null : state.currentId,
          playing: state.currentId === id ? false : state.playing,
        }));
      },

      renameVideo: (id, title) => {
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, title } : i)),
        }));
      },

      setCachePath: (id, path) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id
              ? {
                  ...i,
                  cachePath: path,
                  ...(isReusableAudioCache(path)
                    ? { importStatus: "ready" as const, importProgress: 100, importError: undefined }
                    : {}),
                }
              : i,
          ),
        }));
      },

      patchVideo: (id, patch) => {
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        }));
      },

      replaceVideoId: (fromId, toId) => {
        if (fromId === toId) return true;
        if (!get().has(fromId) || get().has(toId)) return false;
        set((state) => ({
          items: state.items.map((i) => (i.id === fromId ? { ...i, id: toId } : i)),
          playlists: state.playlists.map((playlist) => ({
            ...playlist,
            songIds: playlist.songIds.map((songId) => (songId === fromId ? toId : songId)),
          })),
          queueIds: state.queueIds.map((songId) => (songId === fromId ? toId : songId)),
          shuffleOrder: state.shuffleOrder?.map((songId) => (songId === fromId ? toId : songId)) ?? null,
          currentId: state.currentId === fromId ? toId : state.currentId,
        }));
        return true;
      },

      setImportState: (id, next) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id
              ? {
                  ...i,
                  importStatus: next.status,
                  importProgress: next.progress ?? i.importProgress,
                  importError: next.error,
                }
              : i,
          ),
        }));
      },

      has: (id) => get().items.some((i) => i.id === id),

      createPlaylist: (name) => {
        const trimmed = (name ?? nextPlaylistName(get().playlists)).trim();
        if (!trimmed) return null;
        const now = Date.now();
        const playlist: Playlist = {
          id: newPlaylistId(),
          name: trimmed,
          songIds: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          playlists: [...state.playlists, playlist],
          selectedLibrary: playlist.id,
        }));
        return playlist;
      },

      renamePlaylist: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        let found = false;
        set((state) => ({
          playlists: state.playlists.map((playlist) => {
            if (playlist.id !== id) return playlist;
            found = true;
            return { ...playlist, name: trimmed, updatedAt: Date.now() };
          }),
        }));
        return found;
      },

      deletePlaylist: (id) => {
        set((state) => ({
          playlists: state.playlists.filter((playlist) => playlist.id !== id),
          selectedLibrary: state.selectedLibrary === id ? "all" : state.selectedLibrary,
        }));
      },

      addToPlaylist: (playlistId, songId) => get().addManyToPlaylist(playlistId, [songId]).added > 0,

      addManyToPlaylist: (playlistId, songIds) => {
        const playlist = get().playlists.find((p) => p.id === playlistId);
        if (!playlist) return { added: 0, skipped: songIds.length };
        const have = new Set(playlist.songIds);
        const next: string[] = [];
        let skipped = 0;
        for (const id of songIds) {
          if (!get().has(id) || have.has(id)) {
            skipped += 1;
            continue;
          }
          have.add(id);
          next.push(id);
        }
        if (next.length === 0) return { added: 0, skipped };
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === playlistId ? { ...p, songIds: [...p.songIds, ...next], updatedAt: Date.now() } : p,
          ),
        }));
        return { added: next.length, skipped };
      },

      removeFromPlaylist: (playlistId, songId) => {
        get().removeManyFromPlaylist(playlistId, [songId]);
      },

      removeManyFromPlaylist: (playlistId, songIds) => {
        const drop = new Set(songIds);
        let removed = 0;
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const next = p.songIds.filter((id) => {
              if (!drop.has(id)) return true;
              removed += 1;
              return false;
            });
            if (next.length === p.songIds.length) return p;
            return { ...p, songIds: next, updatedAt: Date.now() };
          }),
        }));
        return removed;
      },

      removeManyVideos: (ids) => {
        const drop = new Set(ids);
        if (drop.size === 0) return;
        set((state) => {
          const currentGone = state.currentId !== null && drop.has(state.currentId);
          return {
            items: state.items.filter((i) => !drop.has(i.id)),
            playlists: stripSongs(state.playlists, drop),
            queueIds: state.queueIds.filter((id) => !drop.has(id)),
            shuffleOrder: state.shuffleOrder?.filter((id) => !drop.has(id)) ?? null,
            currentId: currentGone ? null : state.currentId,
            playing: currentGone ? false : state.playing,
          };
        });
      },

      moveInPlaylist: (playlistId, songId, toIndex) => {
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            const from = p.songIds.indexOf(songId);
            if (from < 0) return p;
            const next = [...p.songIds];
            next.splice(from, 1);
            const clamped = Math.max(0, Math.min(toIndex, next.length));
            next.splice(clamped, 0, songId);
            return { ...p, songIds: next, updatedAt: Date.now() };
          }),
        }));
      },

      setSelectedLibrary: (id) => set({ selectedLibrary: id }),
      setBoardView: (mode) => set({ boardView: mode }),

      setQueue: (ids, playingId) => {
        const currentId = playingId !== undefined ? playingId : get().currentId;
        set({
          queueIds: ids,
          shuffleOrder: get().shuffle ? shuffledOrder(ids, currentId) : null,
        });
      },

      addToQueue: (ids) => {
        const existing = new Set(get().queueIds);
        const unique: string[] = [];
        let skipped = 0;
        for (const id of ids) {
          if (!get().has(id) || existing.has(id)) {
            skipped += 1;
            continue;
          }
          existing.add(id);
          unique.push(id);
        }
        if (unique.length === 0) return { added: 0, skipped };
        set((state) => ({
          queueIds: [...state.queueIds, ...unique],
          shuffleOrder: state.shuffleOrder ? [...state.shuffleOrder, ...unique] : null,
        }));
        return { added: unique.length, skipped };
      },

      setShuffle: (shuffle) => {
        const { queueIds, currentId } = get();
        set({
          shuffle,
          // Shuffle and repeat are mutually exclusive so the active mode is unambiguous.
          repeat: shuffle ? "off" : get().repeat,
          shuffleOrder: shuffle ? shuffledOrder(queueIds, currentId) : null,
        });
      },

      setRepeat: (repeat) =>
        set({
          repeat,
          // Enabling any repeat mode turns shuffle off.
          shuffle: repeat === "off" ? get().shuffle : false,
          shuffleOrder: repeat === "off" ? get().shuffleOrder : null,
        }),

      removeFromQueue: (id) => {
        set((state) => ({
          queueIds: state.queueIds.filter((songId) => songId !== id),
          shuffleOrder: state.shuffleOrder?.filter((songId) => songId !== id) ?? null,
        }));
      },

      setCurrent: (id) => set({ currentId: id, playing: id !== null }),

      setPlaying: (playing) => set({ playing }),
    }),
    {
      name: "zi-player",
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<VideoState>) };
        // Older builds could persist shuffle and repeat together; shuffle wins.
        return merged.shuffle ? { ...merged, repeat: "off" } : merged;
      },
      partialize: (state) => ({
        items: state.items.map(({ importProgress: _progress, ...item }) => ({
          ...item,
          importStatus: durableImportStatus(item),
        })),
        playlists: state.playlists,
        selectedLibrary: state.selectedLibrary,
        boardView: state.boardView,
        shuffle: state.shuffle,
        repeat: state.repeat,
      }),
    },
  ),
);