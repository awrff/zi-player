import { useState } from "react";
import { Empty, Input, Modal } from "antd";
import type { BoardViewMode, VideoItem } from "@/types";
import type { TrackMenuHandlers } from "./trackContextMenu";
import { TrackList } from "./TrackList";
import { Turntable } from "./Turntable";

interface BoardProps extends Omit<TrackMenuHandlers, "onMoveUp" | "onMoveDown" | "onRename"> {
  items: VideoItem[];
  playingId: string | null;
  playing: boolean;
  viewMode?: BoardViewMode;
  emptyKind?: "library" | "playlist";
  onRename: (id: string, title: string) => void;
  onMove?: (item: VideoItem, dir: -1 | 1) => void;
}

export function Board({
  items,
  playingId,
  playing,
  viewMode = "grid",
  emptyKind = "library",
  onRename,
  onMove,
  ...handlers
}: BoardProps) {
  const [renaming, setRenaming] = useState<VideoItem | null>(null);
  const [draft, setDraft] = useState("");

  const startRename = (item: VideoItem) => {
    setRenaming(item);
    setDraft(item.title);
  };

  const commitRename = () => {
    if (renaming && draft.trim()) {
      onRename(renaming.id, draft.trim());
    }
    setRenaming(null);
  };

  const emptyGuide =
    emptyKind === "playlist" ? (
      <div className="board-empty-guide" data-testid="board-empty-guide">
        <p>这个歌单还是空的</p>
        <p>在「全部唱片」里右键唱片，选择「添加到歌单」</p>
      </div>
    ) : (
      <div className="board-empty-guide" data-testid="board-empty-guide">
        <p>唱片架还是空的</p>
        <p>粘贴 B 站视频链接，或点击右上角「添加」把歌加进来</p>
      </div>
    );

  return (
    <section className="board" data-testid="board">
      {items.length === 0 ? (
        <Empty
          data-testid="board-empty"
          style={{ marginTop: 80 }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyGuide}
        />
      ) : viewMode === "list" ? (
        <TrackList items={items} playingId={playingId} playing={playing} onMove={onMove} {...handlers} onRename={startRename} />
      ) : (
        <div className="board-grid" data-testid="board-grid" role="list" aria-label="唱片列表">
          {items.map((item, index) => (
            <div key={item.id} className="board-slot" data-testid="board-slot" role="listitem">
              <Turntable
                item={item}
                playing={playing && playingId === item.id}
                {...handlers}
                onRename={startRename}
                onMoveUp={onMove && index > 0 ? (target) => onMove(target, -1) : undefined}
                onMoveDown={onMove && index < items.length - 1 ? (target) => onMove(target, 1) : undefined}
              />
            </div>
          ))}
        </div>
      )}

      <Modal
        title="重命名"
        open={renaming !== null}
        onOk={commitRename}
        onCancel={() => setRenaming(null)}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ disabled: !draft.trim() }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={commitRename}
          placeholder="视频名称"
          aria-label="rename-input"
        />
      </Modal>
    </section>
  );
}
