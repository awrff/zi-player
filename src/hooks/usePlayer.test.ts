import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoItem } from "@/types";
import { useVideoStore } from "@/store/videoStore";

const h = vi.hoisted(() => ({
  downloadAudio: vi.fn(),
  audioUrl: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  replay: vi.fn(),
  seek: vi.fn(),
  setVolume: vi.fn(),
  subscribe: vi.fn((_cb: () => void) => () => {}),
  onEnded: vi.fn((_cb: () => void) => () => {}),
  onError: vi.fn((_cb: (code: number | null, message: string) => void) => () => {}),
  currentTime: 0,
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
    replay: h.replay,
    seek: h.seek,
    setVolume: h.setVolume,
    subscribe: h.subscribe,
    onEnded: h.onEnded,
    onError: h.onError,
    get currentTime() {
      return h.currentTime;
    },
    duration: 0,
    paused: true,
    volume: 1,
  },
}));

import { isReusableAudioCache, usePlayer } from "./usePlayer";

const item: VideoItem = {
  id: "BV1xx411c7mD",
  url: "https://www.bilibili.com/video/BV1xx411c7mD",
  title: "测试曲目",
  uploader: "测试UP主",
  duration: 180,
  cover: "https://example.com/cover.jpg",
  addedAt: 1,
};

const ready: VideoItem = {
  ...item,
  cachePath: "data:audio/wav;base64,xxx",
  importStatus: "ready",
};

const itemB: VideoItem = {
  ...item,
  id: "BV1xx411c7mE",
  url: "https://www.bilibili.com/video/BV1xx411c7mE",
  title: "第二首",
};

beforeEach(() => {
  h.downloadAudio.mockReset();
  h.audioUrl.mockReset();
  h.play.mockReset();
  h.pause.mockReset();
  h.replay.mockReset();
  h.seek.mockReset();
  h.onEnded.mockReset();
  h.onEnded.mockImplementation(() => () => {});
  h.onError.mockReset();
  h.onError.mockImplementation(() => () => {});
  h.subscribe.mockReset();
  h.subscribe.mockImplementation(() => () => {});
  h.currentTime = 0;
  h.replay.mockResolvedValue(undefined);
  useVideoStore.setState({
    items: [ready],
    currentId: null,
    playing: false,
    queueIds: [],
    shuffleOrder: null,
    shuffle: false,
    repeat: "off",
  });
});

describe("isReusableAudioCache", () => {
  it("accepts local OGG and mock data:audio, rejects AAC and stale protocols", () => {
    expect(isReusableAudioCache("/data/audio/BV.ogg")).toBe(true);
    expect(isReusableAudioCache("data:audio/wav;base64,xxx")).toBe(true);
    expect(isReusableAudioCache("/data/audio/BV.m4a")).toBe(false);
    expect(isReusableAudioCache("asset://localhost/audio/BV.ogg")).toBe(false);
    expect(isReusableAudioCache(undefined)).toBe(false);
  });
});

describe("usePlayer playback errors", () => {
  it("refuses to play a song that is still importing", async () => {
    const pending = { ...item, importStatus: "transcoding" as const };
    useVideoStore.setState({ items: [pending] });
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));

    await act(async () => {
      await result.current.toggle(pending);
    });

    expect(h.downloadAudio).not.toHaveBeenCalled();
    expect(h.play).not.toHaveBeenCalled();
    expect(useVideoStore.getState().currentId).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/导入中/));
  });

  it("does not download when cachePath is a stale AAC file", async () => {
    const stale = { ...item, cachePath: "/data/audio/BV1xx411c7mD.m4a", importStatus: "queued" as const };
    useVideoStore.setState({ items: [stale] });
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));

    await act(async () => {
      await result.current.toggle(stale);
    });

    expect(h.downloadAudio).not.toHaveBeenCalled();
    expect(h.play).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it("reuses a data:audio cachePath used by mock/e2e", async () => {
    h.audioUrl.mockImplementation(async (path: string) => path);
    h.play.mockResolvedValue(undefined);
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));

    await act(async () => {
      await result.current.toggle(ready);
    });

    expect(h.downloadAudio).not.toHaveBeenCalled();
    expect(h.play).toHaveBeenCalledWith("data:audio/wav;base64,xxx");
    expect(onError).not.toHaveBeenCalled();
  });

  it("surfaces a Chinese error when HTMLAudioElement play() rejects", async () => {
    h.audioUrl.mockResolvedValue("data:audio/wav;base64,xxx");
    h.play.mockRejectedValue(new Error("NotSupportedError"));
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));

    await act(async () => {
      await result.current.toggle(ready);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    const msg = onError.mock.calls[0][0] as string;
    expect(msg).toMatch(/无法播放/);
    expect(msg).toMatch(/测试曲目/);
    expect(result.current.lastError).toBe(msg);
  });

  it("ignores an AbortError caused by a new load request", async () => {
    h.audioUrl.mockResolvedValue("data:audio/wav;base64,xxx");
    h.play.mockRejectedValue(
      Object.assign(new Error("The play() request was interrupted by a new load request."), {
        name: "AbortError",
      }),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));

    await act(async () => {
      await result.current.toggle(ready);
    });

    expect(onError).not.toHaveBeenCalled();
    expect(result.current.lastError).toBeNull();
    expect(result.current.preparing).toBe(false);
  });

  it("ignores a play failure from a request superseded by a newer track", async () => {
    let rejectFirst!: (err: unknown) => void;
    const firstPlay = new Promise<void>((_, reject) => {
      rejectFirst = reject;
    });
    h.audioUrl.mockImplementation(async (path: string) => path);
    h.play.mockImplementationOnce(() => firstPlay).mockResolvedValue(undefined);

    const first = { ...ready, cachePath: "data:audio/wav;base64,xxx" };
    const second = { ...itemB, cachePath: "data:audio/wav;base64,yyy", importStatus: "ready" as const };
    useVideoStore.setState({ items: [first, second] });
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));

    let firstPromise!: Promise<void>;
    await act(async () => {
      firstPromise = result.current.playId(first.id);
    });
    await act(async () => {
      await result.current.playId(second.id);
    });

    rejectFirst(
      Object.assign(new Error("The play() request was interrupted by a new load request."), {
        name: "AbortError",
      }),
    );
    await act(async () => {
      await firstPromise;
    });

    expect(onError).not.toHaveBeenCalled();
    expect(useVideoStore.getState().currentId).toBe(second.id);
    expect(result.current.preparing).toBe(false);
  });
});

describe("usePlayer preparing", () => {
  it("is true while audioUrl is in flight and clears on success play", async () => {
    let finishUrl!: (src: string) => void;
    h.audioUrl.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishUrl = resolve;
        }),
    );
    h.play.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePlayer());

    let togglePromise!: Promise<void>;
    await act(async () => {
      togglePromise = result.current.toggle(ready);
    });

    expect(result.current.preparing).toBe(true);
    expect(result.current.lastError).toBeNull();
    expect(h.play).not.toHaveBeenCalled();

    await act(async () => {
      finishUrl("data:audio/wav;base64,xxx");
      await togglePromise;
    });

    expect(result.current.preparing).toBe(false);
    expect(h.play).toHaveBeenCalledWith("data:audio/wav;base64,xxx");
    expect(result.current.lastError).toBeNull();
  });

  it("clears preparing on play failure and keeps the Chinese lastError", async () => {
    h.audioUrl.mockRejectedValue("无法生成播放地址");
    const onError = vi.fn();
    const { result } = renderHook(() => usePlayer(onError));

    await act(async () => {
      await result.current.toggle(ready);
    });

    expect(result.current.preparing).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    const msg = onError.mock.calls[0][0] as string;
    expect(msg).toMatch(/无法播放/);
    expect(msg).toMatch(/测试曲目/);
    expect(result.current.lastError).toBe(msg);
  });
});

describe("usePlayer queue", () => {
  function readyToPlay() {
    h.audioUrl.mockImplementation(async (path: string) => path);
    h.play.mockResolvedValue(undefined);
  }

  it("snapshots the list when playing a different track", async () => {
    readyToPlay();
    const cached = { ...item, cachePath: "data:audio/wav;base64,xxx" };
    const cachedB = { ...itemB, cachePath: "data:audio/wav;base64,yyy" };
    useVideoStore.setState({ items: [cached, cachedB] });
    const { result } = renderHook(() => usePlayer());

    await act(async () => {
      await result.current.playFromList(cached, [cached, cachedB]);
    });

    expect(useVideoStore.getState().queueIds).toEqual([cached.id, cachedB.id]);
    expect(useVideoStore.getState().currentId).toBe(cached.id);
  });

  it("does not rebuild the queue when toggling the current track", async () => {
    readyToPlay();
    const cached = { ...ready };
    useVideoStore.setState({
      items: [cached, itemB],
      currentId: cached.id,
      playing: true,
      queueIds: [cached.id],
    });
    const { result } = renderHook(() => usePlayer());

    await act(async () => {
      await result.current.playFromList(cached, [cached, itemB]);
    });

    expect(useVideoStore.getState().queueIds).toEqual([cached.id]);
    expect(h.pause).toHaveBeenCalled();
  });

  it("plays the next queued track", async () => {
    readyToPlay();
    const cached = { ...ready };
    const cachedB = { ...itemB, cachePath: "data:audio/wav;base64,yyy", importStatus: "ready" as const };
    useVideoStore.setState({
      items: [cached, cachedB],
      currentId: cached.id,
      playing: true,
      queueIds: [cached.id, cachedB.id],
    });
    const { result } = renderHook(() => usePlayer());

    await act(async () => {
      await result.current.playNext();
    });

    expect(h.play).toHaveBeenCalledWith("data:audio/wav;base64,yyy");
    expect(useVideoStore.getState().currentId).toBe(cachedB.id);
  });

  it("advances exactly one track when the current track ends", async () => {
    readyToPlay();
    let endedCb: (() => void) | undefined;
    h.onEnded.mockImplementation((cb: () => void) => {
      endedCb = cb;
      return () => {};
    });

    const cached = { ...ready };
    const cachedB = { ...itemB, cachePath: "data:audio/wav;base64,yyy", importStatus: "ready" as const };
    const cachedC = {
      ...itemB,
      id: "BV1xx411c7mF",
      title: "第三首",
      cachePath: "data:audio/wav;base64,zzz",
      importStatus: "ready" as const,
    };
    useVideoStore.setState({
      items: [cached, cachedB, cachedC],
      currentId: cached.id,
      playing: true,
      queueIds: [cached.id, cachedB.id, cachedC.id],
    });

    renderHook(() => usePlayer());
    expect(endedCb).toBeTypeOf("function");

    await act(async () => {
      endedCb?.();
    });

    await vi.waitFor(() => expect(h.play).toHaveBeenCalledWith("data:audio/wav;base64,yyy"));
    expect(h.play).toHaveBeenCalledTimes(1);
    expect(useVideoStore.getState().currentId).toBe(cachedB.id);
  });

  it("restarts the current track when previous is pressed after 3s", async () => {
    h.currentTime = 12;
    const cached = { ...ready };
    useVideoStore.setState({
      items: [cached],
      currentId: cached.id,
      playing: true,
      queueIds: [cached.id],
    });
    const { result } = renderHook(() => usePlayer());

    await act(async () => {
      await result.current.playPrev();
    });

    expect(h.seek).toHaveBeenCalledWith(0);
    expect(h.play).not.toHaveBeenCalled();
  });

  it("replaces the queue when playing a selected list that includes the current track", async () => {
    readyToPlay();
    const cached = { ...ready };
    const cachedB = { ...itemB, cachePath: "data:audio/wav;base64,yyy", importStatus: "ready" as const };
    useVideoStore.setState({
      items: [cached, cachedB],
      currentId: cached.id,
      playing: true,
      queueIds: [cached.id],
    });
    const { result } = renderHook(() => usePlayer());

    await act(async () => {
      await expect(result.current.playSelected([cached, cachedB])).resolves.toBe(true);
    });

    expect(useVideoStore.getState().queueIds).toEqual([cached.id, cachedB.id]);
    expect(h.play).toHaveBeenCalledWith("data:audio/wav;base64,xxx");
  });

  it("returns false when no selected song is playable", async () => {
    const pending = { ...item, importStatus: "transcoding" as const };
    useVideoStore.setState({ items: [pending] });
    const { result } = renderHook(() => usePlayer());

    await act(async () => {
      await expect(result.current.playSelected([pending])).resolves.toBe(false);
    });

    expect(useVideoStore.getState().queueIds).toEqual([]);
    expect(h.play).not.toHaveBeenCalled();
  });

  it("skips an unplayable next track", async () => {
    readyToPlay();
    const cached = { ...ready };
    const pending = { ...itemB, importStatus: "transcoding" as const };
    const cachedC: VideoItem = {
      ...itemB,
      id: "BV1xx411c7mF",
      title: "第三首",
      cachePath: "data:audio/wav;base64,zzz",
      importStatus: "ready",
    };
    useVideoStore.setState({
      items: [cached, pending, cachedC],
      currentId: cached.id,
      playing: true,
      queueIds: [cached.id, pending.id, cachedC.id],
    });
    const { result } = renderHook(() => usePlayer());

    await act(async () => {
      await result.current.playNext();
    });

    expect(h.play).toHaveBeenCalledWith("data:audio/wav;base64,zzz");
    expect(useVideoStore.getState().currentId).toBe(cachedC.id);
  });
});
