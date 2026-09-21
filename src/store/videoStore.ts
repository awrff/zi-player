import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newPlaylistId, nextPlaylistName } from "@/lib/playlist";
import { shuffledOrder } from "@/lib/playQueue";
import type { BoardViewMode, LibrarySelection, Playlist, RepeatMode, VideoItem, VideoMeta } from "@/types";

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

  /** Add a video; returns the new item, or null when it is a duplicate. */
  addVideo: (meta: VideoMeta) => VideoItem | null;
  removeVideo: (id: string) => void;
  renameVideo: (id: string, title: string) => void;
  setCachePath: (id: string, path: string) => void;
  has: (id: string) => boolean;

  createPlaylist: (name?: string) => Playlist | null;
  renamePlaylist: (id: string, name: string) => boolean;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, songId: string) => boolean;
  removeFromPlaylist: (playlistId: string, songId: string) => void;
  moveInPlaylist: (playlistId: string, songId: string, toIndex: number) => void;
  setSelectedLibrary: (id: LibrarySelection) => void;
  setBoardView: (mode: BoardViewMode) => void;

  setQueue: (ids: string[], playingId?: string | null) => void;
  setShuffle: (shuffle: boolean) => void;
  setRepeat: (repeat: RepeatMode) => void;
  removeFromQueue: (id: string) => void;

  /** Set the active track (and start playing it). */
  setCurrent: (id: string | null) => void;
  /** Pause/resume the active track. */
  setPlaying: (playing: boolean) => void;
}

function stripSong(playlists: Playlist[], songId: string): Playlist[] {
  return playlists.map((playlist) =>
    playlist.songIds.includes(songId)
      ? { ...playlist, songIds: playlist.songIds.filter((id) => id !== songId), updatedAt: Date.now() }
      : playlist,
  );
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
          items: state.items.map((i) => (i.id === id ? { ...i, cachePath: path } : i)),
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

      addToPlaylist: (playlistId, songId) => {
        const playlist = get().playlists.find((p) => p.id === playlistId);
        if (!playlist || !get().has(songId) || playlist.songIds.includes(songId)) return false;
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === playlistId ? { ...p, songIds: [...p.songIds, songId], updatedAt: Date.now() } : p,
          ),
        }));
        return true;
      },

      removeFromPlaylist: (playlistId, songId) => {
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === playlistId && p.songIds.includes(songId)
              ? { ...p, songIds: p.songIds.filter((id) => id !== songId), updatedAt: Date.now() }
              : p,
          ),
        }));
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

      setShuffle: (shuffle) => {
        const { queueIds, currentId } = get();
        set({
          shuffle,
          shuffleOrder: shuffle ? shuffledOrder(queueIds, currentId) : null,
        });
      },

      setRepeat: (repeat) => set({ repeat }),

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
      name: "bili-board",
      partialize: (state) => ({
        items: state.items,
        playlists: state.playlists,
        selectedLibrary: state.selectedLibrary,
        boardView: state.boardView,
        shuffle: state.shuffle,
        repeat: state.repeat,
      }),
    },
  ),
);