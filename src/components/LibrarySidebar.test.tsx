import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Playlist, VideoItem } from "@/types";
import { LibrarySidebar } from "./LibrarySidebar";

const items: VideoItem[] = [
  {
    id: "BV1",
    url: "https://www.bilibili.com/video/BV1",
    title: "歌",
    uploader: "UP",
    duration: 10,
    cover: "https://example.com/a.jpg",
    addedAt: 1,
  },
];

const playlists: Playlist[] = [
  { id: "pl-1", name: "通勤", songIds: ["BV1"], createdAt: 1, updatedAt: 1 },
];

describe("LibrarySidebar", () => {
  it("shows the library entry and an enabled new-playlist action", () => {
    render(
      <LibrarySidebar
        itemCount={3}
        playlists={[]}
        items={[]}
        selectedLibrary="all"
        onSelect={() => {}}
        onCreate={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByTestId("library-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("library-all")).toHaveTextContent("全部唱片");
    expect(screen.getByTestId("library-all")).toHaveTextContent("3");
    expect(screen.getByTestId("library-all")).toHaveClass("is-active");
    expect(screen.getByTestId("library-new-playlist")).toBeEnabled();
  });

  it("lists playlists and reports the selection", () => {
    const onSelect = vi.fn();
    render(
      <LibrarySidebar
        itemCount={1}
        playlists={playlists}
        items={items}
        selectedLibrary="pl-1"
        onSelect={onSelect}
        onCreate={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByTestId("library-playlist")).toHaveTextContent("通勤");
    expect(screen.getByTestId("library-playlist")).toHaveTextContent("1");
    expect(screen.getByTestId("library-playlist")).toHaveClass("is-active");
    expect(screen.getByTestId("library-all")).not.toHaveClass("is-active");

    fireEvent.click(screen.getByTestId("library-all"));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("creates a playlist from the header action", () => {
    const onCreate = vi.fn();
    render(
      <LibrarySidebar
        itemCount={0}
        playlists={[]}
        items={[]}
        selectedLibrary="all"
        onSelect={() => {}}
        onCreate={onCreate}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("library-new-playlist"));
    expect(onCreate).toHaveBeenCalled();
  });
});
