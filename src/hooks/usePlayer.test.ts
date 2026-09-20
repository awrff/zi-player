import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoItem } from "@/types";
import { useVideoStore } from "@/store/videoStore";

const h = vi.hoisted(() => ({
  downloadAudio: vi.fn(),
  audioUrl: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  onEnded: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
}));

vi.mock("@/lib/native", () => ({
  native: {
    downloadAudio: h.downloadAudio,
    audioUrl: h.audioUrl,
  },
}));

vi.mock("@/lib/player", () => ({
  player: {
    play: h.play,
    pause: h.pause,
    seek: h.seek,
    setVolume: h.setVolume,
    subscribe: h.subscribe,
    onEnded: h.onEnded,
    onError: h.onError,
    currentTime: 0,
    duration: 0,
    paused: true,
    volume: 1,
  },
}));

import { usePlayer } from "./usePlayer";

const item: VideoItem = {
  id: "BV1xx411c7mD",
  url: "https://www.bilibili.com/video/BV1xx411c7mD",
  title: "测试曲目",
  uploader: "测试UP主",
  duration: 180,
  cover: "https://example.com/cover.jpg",
  addedAt: 1,
};

beforeEach(() => {
  h.downloadAudio.mockReset();
  h.audioUrl.mockReset();
  h.play.mockReset();
  h.pause.mockReset();
  useVideoStore.setState({ items: [item], currentId: null, playing: false });
});

describe("usePlayer playback errors", () => {
  it("surfaces a Chinese error when download/transcode fails", async () => {
    h.downloadAudio.mockRejectedValue("音频转码失败：无法启动 sidecar `ffmpeg`。未生成可播放的 OGG。");
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));

    await act(async () => {
      await result.current.toggle(item);
    });

    expect(h.play).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const msg = onError.mock.calls[0][0] as string;
    expect(msg).toMatch(/无法播放/);
    expect(msg).toMatch(/测试曲目/);
    expect(msg).toMatch(/转码失败|ffmpeg/);
    expect(result.current.lastError).toBe(msg);
  });

  it("re-fetches when cachePath is a stale AAC file instead of OGG", async () => {
    h.downloadAudio.mockResolvedValue("/data/audio/BV1xx411c7mD.ogg");
    h.audioUrl.mockResolvedValue("http://127.0.0.1:9/audio/BV1xx411c7mD.ogg");
    h.play.mockResolvedValue(undefined);
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));
    const stale = { ...item, cachePath: "/data/audio/BV1xx411c7mD.m4a" };

    await act(async () => {
      await result.current.toggle(stale);
    });

    expect(h.downloadAudio).toHaveBeenCalledWith(stale.id, stale.url);
    expect(h.play).toHaveBeenCalledWith("http://127.0.0.1:9/audio/BV1xx411c7mD.ogg");
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.lastError).toBeNull();
  });

  it("surfaces a Chinese error when HTMLAudioElement play() rejects", async () => {
    h.downloadAudio.mockResolvedValue("/data/audio/BV1xx411c7mD.ogg");
    h.audioUrl.mockResolvedValue("http://127.0.0.1:9/audio/BV1xx411c7mD.ogg");
    h.play.mockRejectedValue(new Error("NotSupportedError"));
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));

    await act(async () => {
      await result.current.toggle(item);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    const msg = onError.mock.calls[0][0] as string;
    expect(msg).toMatch(/无法播放/);
    expect(msg).toMatch(/测试曲目/);
    expect(result.current.lastError).toBe(msg);
  });
});
