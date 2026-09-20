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

  it("reorders items when a card is dropped on another", () => {
    const onReorder = vi.fn();
    render(
      <Board
        items={makeItems(3)}
        playingId={null}
        playing={false}
        onToggle={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        onReorder={onReorder}
      />,
    );

    const slots = screen.getAllByTestId("board-slot");
    fireEvent.dragStart(slots[0]);
    fireEvent.dragOver(slots[2]);
    fireEvent.drop(slots[2]);

    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("does not reorder when a card is dropped on itself", () => {
    const onReorder = vi.fn();
    render(
      <Board
        items={makeItems(2)}
        playingId={null}
        playing={false}
        onToggle={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        onReorder={onReorder}
      />,
    );

    const slots = screen.getAllByTestId("board-slot");
    fireEvent.dragStart(slots[1]);
    fireEvent.drop(slots[1]);

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("marks the drag source and drop target while dragging", () => {
    render(
      <Board
        items={makeItems(3)}
        playingId={null}
        playing={false}
        onToggle={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        onReorder={() => {}}
      />,
    );

    const slots = screen.getAllByTestId("board-slot");
    fireEvent.dragStart(slots[0]);
    fireEvent.dragOver(slots[2]);

    expect(slots[0]).toHaveClass("is-dragging");
    expect(slots[2]).toHaveClass("is-drop-target");
  });

  it("moves a focused card with Alt+Arrow keys", () => {
    const onReorder = vi.fn();
    render(
      <Board
        items={makeItems(3)}
        playingId={null}
        playing={false}
        onToggle={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        onReorder={onReorder}
      />,
    );

    const cards = screen.getAllByTestId("turntable");
    cards[1].focus();
    fireEvent.keyDown(cards[1], { key: "ArrowLeft", altKey: true });

    expect(onReorder).toHaveBeenCalledWith(1, 0);
  });

  it("does not toggle playback after a drag", () => {
    const onToggle = vi.fn();
    render(
      <Board
        items={makeItems(2)}
        playingId={null}
        playing={false}
        onToggle={onToggle}
        onDelete={() => {}}
        onRename={() => {}}
        onReorder={() => {}}
      />,
    );

    const slots = screen.getAllByTestId("board-slot");
    fireEvent.dragStart(slots[0]);
    fireEvent.drop(slots[1]);
    fireEvent.dragEnd(slots[0]);
    fireEvent.click(screen.getAllByTestId("turntable")[0]);

    expect(onToggle).not.toHaveBeenCalled();
  });
});
