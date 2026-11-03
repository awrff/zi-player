import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PREPARING_HINT, type PlayerControls } from "@/hooks/usePlayer";
import type { VideoItem } from "@/types";

const h = vi.hoisted(() => ({
  currentTime: 0,
  duration: 0,
  listener: undefined as (() => void) | undefined,
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/player", () => ({
  player: {
    get currentTime() {
      return h.currentTime;
    },
    get duration() {
      return h.duration;
    },
    subscribe: vi.fn((listener: () => void) => {
      h.listener = listener;
      return h.unsubscribe;
    }),
  },
}));

import { PlayerBar } from "./PlayerBar";

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
  h.currentTime = 0;
  h.duration = 0;
  h.listener = undefined;
  h.unsubscribe.mockReset();
});

function stub(partial: Partial<PlayerControls> = {}): PlayerControls {
  return {
    current: null,
    playing: false,
    volume: 1,
    lastError: null,
    preparing: false,
    shuffle: false,
    repeat: "off",
    queue: [],
    canPrev: false,
    canNext: false,
    toggle: async () => {},
    playFromList: async () => {},
    playSelected: async () => false,
    playId: async () => {},
    playNext: async () => {},
    playPrev: async () => {},
    pause: () => {},
    stop: () => {},
    seek: () => {},
    setVolume: () => {},
    setShuffle: () => {},
    cycleRepeat: () => {},
    removeFromQueue: () => {},
    ...partial,
  };
}

describe("PlayerBar preparing", () => {
  it("subscribes to playback progress locally and unsubscribes on unmount", () => {
    const { unmount } = render(<PlayerBar controls={stub({ current: item })} />);

    h.currentTime = 42;
    h.duration = 200;
    act(() => h.listener?.());

    expect(screen.getByText("0:42")).toBeInTheDocument();
    unmount();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("shows a Chinese preparing hint while download/transcode is in progress", () => {
    render(<PlayerBar controls={stub({ current: item, preparing: true, canPrev: true })} />);
    expect(screen.getByTestId("player-preparing")).toHaveTextContent(PREPARING_HINT);
  });

  it("still shows the #4 Chinese error when not preparing", () => {
    const lastError = "无法播放「测试曲目」：音频转码失败：无法启动 sidecar `ffmpeg`。未生成可播放的 OGG。";
    render(<PlayerBar controls={stub({ lastError })} />);
    expect(screen.getByTestId("player-error")).toHaveTextContent(lastError);
    expect(screen.queryByTestId("player-preparing")).not.toBeInTheDocument();
  });

  it("toggles mute from the speaker icon", async () => {
    const setVolume = vi.fn();
    const { rerender } = render(
      <PlayerBar controls={stub({ current: item, volume: 0.6, setVolume })} />,
    );
    await userEvent.click(screen.getByLabelText("mute"));
    expect(setVolume).toHaveBeenCalledWith(0);

    rerender(<PlayerBar controls={stub({ current: item, volume: 0, setVolume })} />);
    await userEvent.click(screen.getByLabelText("unmute"));
    expect(setVolume).toHaveBeenCalledWith(0.6);
  });

  it("renders transport controls without a delete button", () => {
    render(<PlayerBar controls={stub({ current: item, canPrev: true, canNext: true })} />);
    expect(screen.getByLabelText("play")).toBeInTheDocument();
    expect(screen.getByLabelText("previous")).toBeInTheDocument();
    expect(screen.getByLabelText("next")).toBeInTheDocument();
    expect(screen.getByLabelText("shuffle")).toBeInTheDocument();
    expect(screen.getByLabelText("repeat")).toBeInTheDocument();
    expect(screen.getByLabelText("queue")).toBeInTheDocument();
    expect(screen.queryByLabelText("delete")).not.toBeInTheDocument();
  });
});
