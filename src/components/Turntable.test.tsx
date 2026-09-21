import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Turntable } from "./Turntable";
import type { VideoItem } from "@/types";

const item: VideoItem = {
  id: "BV1xx411c7mD",
  url: "https://www.bilibili.com/video/BV1xx411c7mD",
  title: "测试视频标题",
  uploader: "测试UP主",
  duration: 233,
  cover: "https://example.com/cover.jpg",
  addedAt: 1,
};

describe("Turntable", () => {
  it("renders cover, title and uploader", () => {
    render(<Turntable item={item} playing={false} onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />);
    expect(screen.getByText("测试视频标题")).toBeInTheDocument();
    expect(screen.getByText(/测试UP主/)).toBeInTheDocument();
    expect(screen.getByAltText("测试视频标题")).toHaveAttribute("src", "https://example.com/cover.jpg");
  });

  it("spins the disc only while playing", () => {
    const { rerender } = render(
      <Turntable item={item} playing={false} onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />,
    );
    expect(screen.getByTestId("vinyl-disc")).not.toHaveAttribute("data-spinning");

    rerender(
      <Turntable item={item} playing onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />,
    );
    expect(screen.getByTestId("vinyl-disc")).toHaveAttribute("data-spinning");
    expect(screen.getByTestId("vinyl-disc").className).toContain("spinning");
  });

  it("toggles on click", () => {
    const onToggle = vi.fn();
    render(<Turntable item={item} playing={false} onToggle={onToggle} onDelete={() => {}} onRename={() => {}} />);
    fireEvent.click(screen.getByTestId("turntable"));
    expect(onToggle).toHaveBeenCalledWith(item);
  });

  it("shows a play overlay that switches to pause while playing", () => {
    const { rerender } = render(
      <Turntable item={item} playing={false} onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />,
    );
    expect(screen.getByTestId("turntable-play").querySelector(".anticon-play-circle")).toBeTruthy();

    rerender(<Turntable item={item} playing onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />);
    expect(screen.getByTestId("turntable-play").querySelector(".anticon-pause-circle")).toBeTruthy();
  });

  it("toggles from the context menu and switches the label", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <Turntable item={item} playing={false} onToggle={onToggle} onDelete={() => {}} onRename={() => {}} />,
    );

    fireEvent.contextMenu(screen.getByTestId("turntable"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "播放" }));
    expect(onToggle).toHaveBeenCalledWith(item);

    rerender(<Turntable item={item} playing onToggle={onToggle} onDelete={() => {}} onRename={() => {}} />);
    fireEvent.contextMenu(screen.getByTestId("turntable"));
    expect(await screen.findByRole("menuitem", { name: "暂停" })).toBeInTheDocument();
  });

  it("adds a song to a playlist from the context menu", async () => {
    const onAddToPlaylist = vi.fn();
    render(
      <Turntable
        item={item}
        playing={false}
        onToggle={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        playlists={[{ id: "pl-1", name: "通勤", songIds: [], createdAt: 1, updatedAt: 1 }]}
        onAddToPlaylist={onAddToPlaylist}
        onCreatePlaylistFor={() => {}}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId("turntable"));
    expect(await screen.findByText("添加到歌单")).toBeInTheDocument();
  });

  it("exposes rename and delete in the context menu", async () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(<Turntable item={item} playing={false} onToggle={() => {}} onDelete={onDelete} onRename={onRename} />);

    fireEvent.contextMenu(screen.getByTestId("turntable"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    expect(onRename).toHaveBeenCalledWith(item);

    fireEvent.contextMenu(screen.getByTestId("turntable"));
    expect(await screen.findByRole("menuitem", { name: "删除" })).toBeInTheDocument();
  });
});
