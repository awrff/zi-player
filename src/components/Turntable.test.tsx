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
  cachePath: "data:audio/wav;base64,xxx",
  importStatus: "ready",
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

  it("shows a cache badge when ready and blocks play while importing", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <Turntable item={item} playing={false} onToggle={onToggle} onDelete={() => {}} onRename={() => {}} />,
    );
    expect(screen.getByTestId("cache-badge")).toBeInTheDocument();

    const pending = { ...item, cachePath: undefined, importStatus: "transcoding" as const, importProgress: 40 };
    rerender(
      <Turntable item={pending} playing={false} onToggle={onToggle} onDelete={() => {}} onRename={() => {}} />,
    );
    expect(screen.getByTestId("import-status")).toHaveTextContent("下载转码");
    expect(screen.queryByTestId("turntable-play")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("turntable"));
    expect(onToggle).toHaveBeenCalledWith(pending);
  });

  it("retries a failed import from the card", () => {
    const onRetry = vi.fn();
    const failed = { ...item, cachePath: undefined, importStatus: "failed" as const, importError: "网络异常" };
    render(
      <Turntable item={failed} playing={false} onToggle={() => {}} onRetry={onRetry} onDelete={() => {}} onRename={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("turntable"));
    expect(onRetry).toHaveBeenCalledWith(failed);
  });

  it("toggles on click", () => {
    const onToggle = vi.fn();
    render(<Turntable item={item} playing={false} onToggle={onToggle} onDelete={() => {}} onRename={() => {}} />);
    fireEvent.click(screen.getByTestId("turntable"));
    expect(onToggle).toHaveBeenCalledWith(item);
  });

  it("does not play when selection mode handles the click", () => {
    const onToggle = vi.fn();
    const onSelectClick = vi.fn(() => "select" as const);
    render(
      <Turntable
        item={item}
        playing={false}
        onToggle={onToggle}
        onRename={() => {}}
        selection={{
          selecting: true,
          selectedIds: new Set([item.id]),
          onSelectClick,
          onSelectToggle: () => {},
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("turntable"));
    expect(onSelectClick).toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByTestId("turntable")).toHaveAttribute("data-selected");
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
