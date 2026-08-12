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
  }));
}

describe("Board", () => {
  it("shows an empty state when there are no items", () => {
    render(<Board items={[]} playingId={null} playing={false} onToggle={() => {}} onDelete={() => {}} onRename={() => {}} />);
    expect(screen.getByTestId("board-empty")).toBeInTheDocument();
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

  it("renames an item through the modal", () => {
    const onRename = vi.fn();
    render(
      <Board items={makeItems(2)} playingId={null} playing={false} onToggle={() => {}} onDelete={() => {}} onRename={onRename} />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "rename" })[0]);
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("rename-input");
    fireEvent.change(input, { target: { value: "新标题" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /保\s*存/ }));

    expect(onRename).toHaveBeenCalledWith("BV0", "新标题");
  });
});
