import { useState } from "react";
import { Empty, Input, Modal } from "antd";
import type { VideoItem } from "@/types";
import { Turntable } from "./Turntable";

interface BoardProps {
  items: VideoItem[];
  playingId: string | null;
  playing: boolean;
  onToggle: (item: VideoItem) => void;
  onDelete: (item: VideoItem) => void;
  onRename: (id: string, title: string) => void;
}

export function Board({ items, playingId, playing, onToggle, onDelete, onRename }: BoardProps) {
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

  return (
    <section className="board" data-testid="board">
      {items.length === 0 ? (
        <Empty
          data-testid="board-empty"
          style={{ marginTop: 80 }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="唱片架是空的 —— 粘贴 B 站链接或点击右上角「添加」开始收藏"
        />
      ) : (
        <div className="board-grid" data-testid="board-grid">
          {items.map((item) => (
            <Turntable
              key={item.id}
              item={item}
              playing={playing && playingId === item.id}
              onToggle={onToggle}
              onDelete={onDelete}
              onRename={startRename}
            />
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
