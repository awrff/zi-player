import { useCallback, useEffect, useRef, useState } from "react";
import { native } from "@/lib/native";
import { player } from "@/lib/player";
import { formatSidecarGuidance } from "@/lib/sidecarError";
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
  /** True while download / transcode / audio_url is in flight. */
  preparing: boolean;
  toggle: (item: VideoItem) => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
}

/** Inline / status copy shown while a vinyl is preparing to play. */
export const PREPARING_HINT = "正在准备音频…";

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

/** Local OGG, or a mock/e2e `data:audio/…` fixture. Stale AAC / asset URLs are not reusable. */
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
  const setCurrent = useVideoStore((s) => s.setCurrent);
  const setPlaying = useVideoStore((s) => s.setPlaying);
  const setCachePath = useVideoStore((s) => s.setCachePath);

  const current = items.find((i) => i.id === currentId) ?? null;

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

  useEffect(() => {
    const unsub = player.subscribe(() => {
      setCurrentTime(player.currentTime);
      setAudioDuration(player.duration);
      setPaused(player.paused);
    });
    const unsubEnded = player.onEnded(() => setPlaying(false));
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
      reportedRef.current = false;
      setLastError(null);
      setPreparing(true);
      try {
        let path = item.cachePath;
        if (!isReusableAudioCache(path)) {
          path = await native.downloadAudio(item.id, item.url);
          setCachePath(item.id, path);
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
    [currentId, playing, setCurrent, setPlaying, setCachePath, reportError],
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

  return { current, playing, currentTime, duration, paused, volume, lastError, preparing, toggle, pause, stop, seek, setVolume };
}
