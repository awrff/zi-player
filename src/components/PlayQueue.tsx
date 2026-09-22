import { Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { formatDuration } from "@/lib/format";
import { importStatusLabel, isPlayable, normalizeImportStatus } from "@/lib/importStatus";
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
            const playable = isPlayable(item);
            const status = normalizeImportStatus(item);
            return (
              <li
                key={item.id}
                className={[
                  "play-queue-row",
                  active ? "is-active" : "",
                  playable ? "" : "is-pending",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  type="button"
                  className="play-queue-main"
                  disabled={!playable}
                  onClick={() => onPlay(item)}
                >
                  {item.cover ? (
                    <img className="play-queue-cover" src={item.cover} alt="" />
                  ) : (
                    <span className="play-queue-cover" />
                  )}
                  <span className="play-queue-meta">
                    <span className="play-queue-title">{item.title}</span>
                    <span className="play-queue-sub">
                      {playable
                        ? `${item.uploader}${active ? (playing ? " · 正在播放" : " · 已暂停") : ""}`
                        : importStatusLabel(status)}
                    </span>
                  </span>
                  <span className="play-queue-time">{playable ? formatDuration(item.duration) : ""}</span>
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
