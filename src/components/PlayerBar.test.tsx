import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PREPARING_HINT, type PlayerControls } from "@/hooks/usePlayer";
import type { VideoItem } from "@/types";
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

function stub(partial: Partial<PlayerControls> = {}): PlayerControls {
  return {
    current: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    paused: true,
    volume: 1,
    lastError: null,
    preparing: false,
    toggle: async () => {},
    pause: () => {},
    stop: () => {},
    seek: () => {},
    setVolume: () => {},
    ...partial,
  };
}

describe("PlayerBar preparing", () => {
  it("shows a Chinese preparing hint while download/transcode is in progress", () => {
    render(<PlayerBar controls={stub({ current: item, preparing: true })} onDelete={() => {}} />);
    expect(screen.getByTestId("player-preparing")).toHaveTextContent(PREPARING_HINT);
  });

  it("still shows the #4 Chinese error when not preparing", () => {
    const lastError = "无法播放「测试曲目」：音频转码失败：无法启动 sidecar `ffmpeg`。未生成可播放的 OGG。";
    render(<PlayerBar controls={stub({ lastError })} onDelete={() => {}} />);
    expect(screen.getByTestId("player-error")).toHaveTextContent(lastError);
    expect(screen.queryByTestId("player-preparing")).not.toBeInTheDocument();
  });
});
