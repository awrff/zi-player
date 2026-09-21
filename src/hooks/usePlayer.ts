import { useCallback, useEffect, useRef, useState } from "react";
import { native } from "@/lib/native";
import { player } from "@/lib/player";
import { nextId, nextRepeatMode, playOrder, prevId, shouldRestartOnPrev, skipRepeat } from "@/lib/playQueue";
import { resolvePlaylistSongs } from "@/lib/playlist";
import { formatSidecarGuidance } from "@/lib/sidecarError";
import { useVideoStore } from "@/store/videoStore";
import type { RepeatMode, VideoItem } from "@/types";

export interface PlayerControls {
  current: VideoItem | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  lastError: string | null;
  preparing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  queue: VideoItem[];
  canPrev: boolean;
  canNext: boolean;
  toggle: (item: VideoItem) => Promise<void>;
  playFromList: (item: VideoItem, list: VideoItem[]) => Promise<void>;
  playId: (id: string) => Promise<void>;
  playNext: () => Promise<void>;
  playPrev: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  setShuffle: (value: boolean) => void;
  cycleRepeat: () => void;
  removeFromQueue: (id: string) => void;
}

export const PREPARING_HINT = "正在准备音频…";

export function hostErrorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(err);
}

export function formatPlayError(title: string, err: unknown): string {
  return `无法播放「${title}」：${hostErrorText(err)}`;
}

export function formatDecodeError(code: number | null, message: string): string {
  const detail = code != null ? `（错误码 ${code}${message ? `：${message}` : ""}）` : "";
  return `音频无法解码${detail}，请确认已打包 ffmpeg 或安装系统编解码器`;
}

export function isReusableAudioCache(path: string | undefined): boolean {
  if (!path) return false;
  if (/^(asset|blob|https?):/i.test(path)) return false;
  if (/^data:audio\//i.test(path)) return true;
  return /\.ogg$/i.test(path);
}

export function usePlayer(onError?: (msg: string) => void): PlayerControls {
  const items = useVideoStore((s) => s.items);
  const currentId = useVideoStore((s) => s.currentId);
  const playing = useVideoStore((s) => s.playing);
  const queueIds = useVideoStore((s) => s.queueIds);
  const shuffleOrder = useVideoStore((s) => s.shuffleOrder);
  const shuffle = useVideoStore((s) => s.shuffle);
  const repeat = useVideoStore((s) => s.repeat);
  const setCurrent = useVideoStore((s) => s.setCurrent);
  const setPlaying = useVideoStore((s) => s.setPlaying);
  const setCachePath = useVideoStore((s) => s.setCachePath);
  const setQueue = useVideoStore((s) => s.setQueue);
  const setShuffleState = useVideoStore((s) => s.setShuffle);
  const setRepeat = useVideoStore((s) => s.setRepeat);
  const dropFromQueue = useVideoStore((s) => s.removeFromQueue);

  const current = items.find((i) => i.id === currentId) ?? null;
  const order = playOrder(queueIds, shuffleOrder);
  const queue = resolvePlaylistSongs(order, items);

  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [volume, setVolumeState] = useState(1);
  const [lastError, setLastError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const reportedRef = useRef(false);

  const reportError = useCallback(
    (msg: string) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      setLastError(msg);
      onError?.(msg);
    },
    [onError],
  );

  const playItem = useCallback(
    async (item: VideoItem) => {
      setCurrent(item.id);
      reportedRef.current = false;
      setLastError(null);
      setPreparing(true);
      try {
        const latest = useVideoStore.getState().items.find((i) => i.id === item.id) ?? item;
        let path = [item.cachePath, latest.cachePath].find(isReusableAudioCache) ?? item.cachePath ?? latest.cachePath;
        if (!isReusableAudioCache(path)) {
          path = await native.downloadAudio(latest.id, latest.url);
          setCachePath(latest.id, path);
        }
        if (!path) throw new Error("音频缓存路径为空");
        const src = await native.audioUrl(path);
        await player.play(src);
      } catch (err) {
        setCurrent(null);
        reportError(formatPlayError(item.title, formatSidecarGuidance(err) ?? err));
      } finally {
        setPreparing(false);
      }
    },
    [setCurrent, setCachePath, reportError],
  );

  const playItemRef = useRef(playItem);
  playItemRef.current = playItem;

  useEffect(() => {
    const unsub = player.subscribe(() => {
      setCurrentTime(player.currentTime);
      setAudioDuration(player.duration);
      setPaused(player.paused);
    });
    const unsubEnded = player.onEnded(() => {
      const state = useVideoStore.getState();
      if (state.repeat === "one" && state.currentId) {
        void player.replay().then(() => state.setPlaying(true));
        return;
      }
      const walk = playOrder(state.queueIds, state.shuffleOrder);
      const id = nextId(walk, state.currentId, skipRepeat(state.repeat));
      const item = id ? state.items.find((i) => i.id === id) : undefined;
      if (!item) {
        state.setPlaying(false);
        return;
      }
      void playItemRef.current(item);
    });
    const unsubError = player.onError((code, message) => {
      setPlaying(false);
      reportError(formatDecodeError(code, message));
    });
    return () => {
      unsub();
      unsubEnded();
      unsubError();
    };
  }, [setPlaying, reportError]);

  useEffect(() => {
    if (currentId === null) player.pause();
  }, [currentId]);

  const duration = current && current.duration > 0 ? current.duration : audioDuration;

  const toggle = useCallback(
    async (item: VideoItem) => {
      if (item.id === currentId && playing) {
        player.pause();
        setPlaying(false);
        return;
      }
      await playItem(item);
    },
    [currentId, playing, setPlaying, playItem],
  );

  const playFromList = useCallback(
    async (item: VideoItem, list: VideoItem[]) => {
      if (item.id !== currentId) {
        setQueue(
          list.map((entry) => entry.id),
          item.id,
        );
      }
      await toggle(item);
    },
    [currentId, setQueue, toggle],
  );

  const playId = useCallback(
    async (id: string) => {
      const item = useVideoStore.getState().items.find((entry) => entry.id === id);
      if (item) await playItem(item);
    },
    [playItem],
  );

  const playNext = useCallback(async () => {
    const state = useVideoStore.getState();
    const walk = playOrder(state.queueIds, state.shuffleOrder);
    const id = nextId(walk, state.currentId, skipRepeat(state.repeat));
    const item = id ? state.items.find((entry) => entry.id === id) : undefined;
    if (item) await playItem(item);
  }, [playItem]);

  const playPrev = useCallback(async () => {
    if (shouldRestartOnPrev(player.currentTime)) {
      player.seek(0);
      return;
    }
    const state = useVideoStore.getState();
    const walk = playOrder(state.queueIds, state.shuffleOrder);
    const id = prevId(walk, state.currentId, skipRepeat(state.repeat));
    if (!id || id === state.currentId) {
      player.seek(0);
      return;
    }
    const item = state.items.find((entry) => entry.id === id);
    if (item) await playItem(item);
  }, [playItem]);

  const pause = useCallback(() => {
    player.pause();
    setPlaying(false);
  }, [setPlaying]);

  const stop = useCallback(() => {
    player.pause();
    setCurrent(null);
  }, [setCurrent]);

  const seek = useCallback((seconds: number) => player.seek(seconds), []);

  const setVolume = useCallback((value: number) => {
    player.setVolume(value);
    setVolumeState(player.volume);
  }, []);

  const setShuffle = useCallback(
    (value: boolean) => {
      setShuffleState(value);
    },
    [setShuffleState],
  );

  const cycleRepeat = useCallback(() => {
    setRepeat(nextRepeatMode(useVideoStore.getState().repeat));
  }, [setRepeat]);

  const removeFromQueue = useCallback(
    (id: string) => {
      const state = useVideoStore.getState();
      const wasCurrent = state.currentId === id;
      dropFromQueue(id);
      if (!wasCurrent) return;
      const nextState = useVideoStore.getState();
      const walk = playOrder(nextState.queueIds, nextState.shuffleOrder);
      const next = nextId(walk, null, "off");
      const item = next ? nextState.items.find((entry) => entry.id === next) : undefined;
      if (item) {
        void playItem(item);
        return;
      }
      stop();
    },
    [dropFromQueue, playItem, stop],
  );

  const skipMode = skipRepeat(repeat);
  const canPrev = current !== null;
  const canNext = current !== null && nextId(order, currentId, skipMode) !== null;

  return {
    current,
    playing,
    currentTime,
    duration,
    paused,
    volume,
    lastError,
    preparing,
    shuffle,
    repeat,
    queue,
    canPrev,
    canNext,
    toggle,
    playFromList,
    playId,
    playNext,
    playPrev,
    pause,
    stop,
    seek,
    setVolume,
    setShuffle,
    cycleRepeat,
    removeFromQueue,
  };
}
