import { useRef, useState } from "react";
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
  onReorder?: (from: number, to: number) => void;
}

export function Board({ items, playingId, playing, onToggle, onDelete, onRename, onReorder }: BoardProps) {
  const [renaming, setRenaming] = useState<VideoItem | null>(null);
  const [draft, setDraft] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  // ponytail: some WebViews fire click after a finished HTML5 drag; one frame is enough to swallow it.
  const suppressClick = useRef(false);

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

  const finishDrag = () => {
    dragFromRef.current = null;
    setDragFrom(null);
    setDragOver(null);
  };

  const moveByKeyboard = (from: number, key: string) => {
    if (!onReorder) return;
    const to = key === "ArrowLeft" || key === "ArrowUp" ? from - 1 : from + 1;
    if (to < 0 || to >= items.length) return;
    onReorder(from, to);
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
        <div
          className="board-grid"
          data-testid="board-grid"
          role="list"
          aria-label="唱片列表，可拖拽排序"
        >
          {items.map((item, index) => {
            const classes = [
              "board-slot",
              dragFrom === index ? "is-dragging" : "",
              dragOver === index && dragFrom !== index ? "is-drop-target" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={item.id}
                className={classes}
                data-testid="board-slot"
                data-index={index}
                role="listitem"
                title="拖拽以调整顺序，或按 Alt+方向键移动"
                draggable={Boolean(onReorder)}
                aria-grabbed={dragFrom === index || undefined}
                onDragStart={(e) => {
                  if (!onReorder) return;
                  suppressClick.current = true;
                  dragFromRef.current = index;
                  setDragFrom(index);
                  if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(index));
                  }
                }}
                onDragOver={(e) => {
                  if (!onReorder) return;
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                  if (dragOver !== index) setDragOver(index);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragFromRef.current;
                  if (onReorder && from !== null && from !== index) {
                    onReorder(from, index);
                  }
                  finishDrag();
                }}
                onDragEnd={() => {
                  finishDrag();
                  window.setTimeout(() => {
                    suppressClick.current = false;
                  }, 0);
                }}
                onKeyDown={(e) => {
                  if (!e.altKey) return;
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") {
                    return;
                  }
                  e.preventDefault();
                  moveByKeyboard(index, e.key);
                }}
              >
                <Turntable
                  item={item}
                  playing={playing && playingId === item.id}
                  onToggle={(next) => {
                    if (suppressClick.current) return;
                    onToggle(next);
                  }}
                  onDelete={onDelete}
                  onRename={startRename}
                />
              </div>
            );
          })}
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
