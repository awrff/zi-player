import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Board } from "./Board";
import type { VideoItem } from "@/types";

function makeItems(n: number): VideoItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `BV${i}`,
    url: `https://www.bilibili.com/video/BV${i}`,
    title: `视频 ${i}`,
    uploader: "UP主",
    duration: 120,
    cover: "https://example.com/cover.jpg",
    addedAt: i,
    cachePath: "data:audio/wav;base64,x",
    importStatus: "ready" as const,
  }));
}

describe("Board", () => {
  it("shows Chinese empty-board guidance when there are no items", () => {
    render(<Board items={[]} playingId={null} playing={false} onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />);
    expect(screen.getByTestId("board-empty")).toBeInTheDocument();
    expect(screen.getByTestId("board-empty-guide")).toHaveTextContent("还没有歌曲");
    expect(screen.getByTestId("board-empty-guide")).toHaveTextContent("粘贴 B 站视频链接");
    expect(screen.getByTestId("board-empty-guide")).toHaveTextContent("添加");
  });

  it("hides empty-board guidance once items exist", () => {
    render(
      <Board items={makeItems(1)} playingId={null} playing={false} onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />,
    );
    expect(screen.queryByTestId("board-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("board-empty-guide")).not.toBeInTheDocument();
    expect(screen.getByTestId("board-grid")).toBeInTheDocument();
  });

  it("renders one turntable per item", () => {
    render(
      <Board items={makeItems(3)} playingId={null} playing={false} onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />,
    );
    expect(screen.getAllByTestId("turntable")).toHaveLength(3);
  });

  it("marks the playing item", () => {
    render(
      <Board items={makeItems(3)} playingId="BV1" playing onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />,
    );
    const playing = screen.getAllByTestId("turntable").filter((el) => el.hasAttribute("data-playing"));
    expect(playing).toHaveLength(1);
    expect(playing[0]).toHaveAttribute("data-id", "BV1");
  });

  it("shows playlist empty copy", () => {
    render(
      <Board
        items={[]}
        playingId={null}
        playing={false}
        emptyKind="playlist"
        onToggle={() => {}}
        onRename={() => {}}
      />,
    );
    expect(screen.getByTestId("board-empty-guide")).toHaveTextContent("这个歌单还是空的");
    expect(screen.getByTestId("board-empty-guide")).toHaveTextContent("添加到歌单");
  });

  it("renders a list view of tracks", () => {
    render(
      <Board items={makeItems(2)} playingId="BV1" playing viewMode="list" onToggle={() => {}} onRename={() => {}} />,
    );
    expect(screen.getByTestId("track-list")).toBeInTheDocument();
    expect(screen.getAllByTestId("track-row")).toHaveLength(2);
    expect(screen.queryByTestId("board-grid")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("track-row")[1]).toHaveAttribute("data-playing");
  });

  it("renames an item through the modal", async () => {
    const onRename = vi.fn();
    render(
      <Board items={makeItems(2)} playingId={null} playing={false} onToggle={() => {}} onDelete={() => {}} onRename={onRename} />,
    );

    fireEvent.contextMenu(screen.getAllByTestId("turntable")[0]);
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("rename-input");
    fireEvent.change(input, { target: { value: "新标题" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /保\s*存/ }));

    expect(onRename).toHaveBeenCalledWith("BV0", "新标题");
  });
});
