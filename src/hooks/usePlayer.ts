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
  toggle: (item: VideoItem) => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
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

  useEffect(() => {
    const unsub = player.subscribe(() => {
      setCurrentTime(player.currentTime);
      setAudioDuration(player.duration);
      setPaused(player.paused);
    });
    const unsubEnded = player.onEnded(() => setPlaying(false));
    const unsubError = player.onError((code, message) => {
      const detail = code != null ? `（错误码 ${code}${message ? `：${message}` : ""}）` : "";
      onError?.(`音频无法解码${detail}，请确认已打包 ffmpeg 或安装系统编解码器`);
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
      try {
        let path = item.cachePath;
        // Migrate stale entries (asset:// blob: http:) persisted before the HTTP-URL switch.
        if (!path || /^(asset|blob|https?):/.test(path)) {
          path = await native.downloadAudio(item.id, item.url);
          setCachePath(item.id, path);
        }
        const src = await native.audioUrl(path);
        await player.play(src);
      } catch (err) {
        setCurrent(null);
        onError?.(`无法播放「${item.title}」：${String(err)}`);
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

  return { current, playing, currentTime, duration, paused, volume, toggle, pause, stop, seek, setVolume };
}
