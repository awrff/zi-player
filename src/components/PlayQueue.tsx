import { Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { formatDuration } from "@/lib/format";
import type { VideoItem } from "@/types";

export function PlayQueue({
  items,
  currentId,
  playing,
  onPlay,
  onRemove,
}: {
  items: VideoItem[];
  currentId: string | null;
  playing: boolean;
  onPlay: (item: VideoItem) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="play-queue" data-testid="play-queue">
      <div className="play-queue-head">
        <span>播放列表</span>
        <span className="play-queue-count">{items.length} 首</span>
      </div>
      {items.length === 0 ? (
        <div className="play-queue-empty">播放列表是空的</div>
      ) : (
        <ul className="play-queue-list">
          {items.map((item) => {
            const active = item.id === currentId;
            return (
              <li key={item.id} className={active ? "play-queue-row is-active" : "play-queue-row"}>
                <button type="button" className="play-queue-main" onClick={() => onPlay(item)}>
                  <img className="play-queue-cover" src={item.cover} alt="" />
                  <span className="play-queue-meta">
                    <span className="play-queue-title">{item.title}</span>
                    <span className="play-queue-sub">
                      {item.uploader}
                      {active ? (playing ? " · 正在播放" : " · 已暂停") : ""}
                    </span>
                  </span>
                  <span className="play-queue-time">{formatDuration(item.duration)}</span>
                </button>
                <Button
                  type="text"
                  size="small"
                  aria-label="remove-from-queue"
                  icon={<CloseOutlined />}
                  onClick={() => onRemove(item.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
