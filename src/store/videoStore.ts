import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { VideoItem, VideoMeta } from "@/types";

export interface VideoState {
  items: VideoItem[];
  /** Id of the active track (kept even while paused). */
  currentId: string | null;
  /** Whether the active track is currently playing (spinning). */
  playing: boolean;

  /** Add a video; returns the new item, or null when it is a duplicate. */
  addVideo: (meta: VideoMeta) => VideoItem | null;
  removeVideo: (id: string) => void;
  renameVideo: (id: string, title: string) => void;
  /** Move an item from one index to another (drag reorder). */
  reorder: (from: number, to: number) => void;
  clearAll: () => void;
  setCachePath: (id: string, path: string) => void;
  has: (id: string) => boolean;

  /** Set the active track (and start playing it). */
  setCurrent: (id: string | null) => void;
  /** Pause/resume the active track. */
  setPlaying: (playing: boolean) => void;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length || to < 0 || to >= arr.length) {
    return arr;
  }
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export const useVideoStore = create<VideoState>()(
  persist(
    (set, get) => ({
      items: [],
      currentId: null,
      playing: false,

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
          currentId: state.currentId === id ? null : state.currentId,
          playing: state.currentId === id ? false : state.playing,
        }));
      },

      renameVideo: (id, title) => {
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, title } : i)),
        }));
      },

      reorder: (from, to) => {
        set((state) => ({ items: move(state.items, from, to) }));
      },

      clearAll: () => set({ items: [], currentId: null, playing: false }),

      setCachePath: (id, path) => {
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, cachePath: path } : i)),
        }));
      },

      has: (id) => get().items.some((i) => i.id === id),

      setCurrent: (id) => set({ currentId: id, playing: id !== null }),

      setPlaying: (playing) => set({ playing }),
    }),
    {
      name: "bili-board",
      // Runtime playback state must never survive a restart.
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
