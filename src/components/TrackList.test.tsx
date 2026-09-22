import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { VideoItem } from "@/types";
import { TrackList } from "./TrackList";

const items: VideoItem[] = [
  {
    id: "BV1",
    url: "https://www.bilibili.com/video/BV1",
    title: "第一首",
    uploader: "Alice",
    duration: 125,
    cover: "https://example.com/a.jpg",
    addedAt: 1,
    cachePath: "data:audio/wav;base64,a",
    importStatus: "ready",
  },
  {
    id: "BV2",
    url: "https://www.bilibili.com/video/BV2",
    title: "第二首",
    uploader: "Bob",
    duration: 90,
    cover: "https://example.com/b.jpg",
    addedAt: 2,
    cachePath: "data:audio/wav;base64,b",
    importStatus: "ready",
  },
];

describe("TrackList", () => {
  it("renders rows and toggles on click", () => {
    const onToggle = vi.fn();
    render(
      <TrackList items={items} playingId="BV2" playing onToggle={onToggle} onRename={() => {}} />,
    );
    expect(screen.getByText("第一首")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getAllByTestId("track-row")[1]).toHaveAttribute("data-playing");
    fireEvent.click(screen.getAllByTestId("track-row")[0]);
    expect(onToggle).toHaveBeenCalledWith(items[0]);
  });

  it("moves a row from the context menu", async () => {
    const onMove = vi.fn();
    render(
      <TrackList items={items} playingId={null} playing={false} onToggle={() => {}} onRename={() => {}} onMove={onMove} />,
    );
    fireEvent.contextMenu(screen.getAllByTestId("track-row")[1]);
    fireEvent.click(await screen.findByRole("menuitem", { name: "上移" }));
    expect(onMove).toHaveBeenCalledWith(items[1], -1);
  });

  it("toggles selection instead of playing while managing", () => {
    const onToggle = vi.fn();
    const onSelectToggle = vi.fn();
    const onSelectClick = vi.fn(() => "select" as const);
    render(
      <TrackList
        items={items}
        playingId={null}
        playing={false}
        onToggle={onToggle}
        onRename={() => {}}
        selection={{
          selecting: true,
          selectedIds: new Set(["BV1"]),
          onSelectClick,
          onSelectToggle,
        }}
      />,
    );
    fireEvent.click(screen.getAllByTestId("track-row")[0]);
    expect(onSelectClick).toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("track-row")[0]).toHaveAttribute("data-selected");
  });
});
