import { useCallback, useEffect, useState } from "react";
import { native } from "@/lib/native";
import { player } from "@/lib/player";
import { useVideoStore } from "@/store/videoStore";
import type { VideoItem } from "@/types";

export interface PlayerControls {
  current: VideoItem | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  paused: boolean;
  volume: number;
  /** Last playback/download/decode error, in Chinese; null when none. */
  lastError: string | null;
  toggle: (item: VideoItem) => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
}

/** Flatten Tauri / Error / string rejections into the message the UI shows. */
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

export function usePlayer(onError?: (msg: string) => void): PlayerControls {
  const items = useVideoStore((s) => s.items);
  const currentId = useVideoStore((s) => s.currentId);
  const playing = useVideoStore((s) => s.playing);
  const setCurrent = useVideoStore((s) => s.setCurrent);
  const setPlaying = useVideoStore((s) => s.setPlaying);
  const setCachePath = useVideoStore((s) => s.setCachePath);

  const current = items.find((i) => i.id === currentId) ?? null;

  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [volume, setVolumeState] = useState(1);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = player.subscribe(() => {
      setCurrentTime(player.currentTime);
      setAudioDuration(player.duration);
      setPaused(player.paused);
    });
    const unsubEnded = player.onEnded(() => setPlaying(false));
    const unsubError = player.onError((code, message) => {
      const msg = formatDecodeError(code, message);
      setLastError(msg);
      setPlaying(false);
      onError?.(msg);
    });
    return () => {
      unsub();
      unsubEnded();
      unsubError();
    };
  }, [setPlaying, onError]);

  // Bilibili DASH audio has no duration metadata, so HTMLAudioElement.duration is
  // Infinity (coerced to 0 by AudioPlayer). Use the duration resolved from yt-dlp
  // as the authoritative total, falling back to the element only if metadata is
  // missing.
  const duration = current && current.duration > 0 ? current.duration : audioDuration;

  const toggle = useCallback(
    async (item: VideoItem) => {
      if (item.id === currentId && playing) {
        player.pause();
        setPlaying(false);
        return;
      }
      setCurrent(item.id);
      setLastError(null);
      try {
        let path = item.cachePath;
        // Re-download unless we already have a local OGG. asset/blob/http leftovers
        // and raw AAC/m4a from the old silent fallback are not playable on Linux.
        if (!path || /^(asset|blob|https?):/.test(path) || !/\.ogg$/i.test(path)) {
          path = await native.downloadAudio(item.id, item.url);
          setCachePath(item.id, path);
        }
        const src = await native.audioUrl(path);
        await player.play(src);
      } catch (err) {
        setCurrent(null);
        const msg = formatPlayError(item.title, err);
        setLastError(msg);
        onError?.(msg);
      }
    },
    [currentId, playing, setCurrent, setPlaying, setCachePath, onError],
  );

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

  return { current, playing, currentTime, duration, paused, volume, lastError, toggle, pause, stop, seek, setVolume };
}
