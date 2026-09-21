import { Dropdown } from "antd";
import type { VideoItem } from "@/types";
import { formatDuration } from "@/lib/format";
import { buildTrackMenu, type TrackMenuHandlers } from "./trackContextMenu";

interface TrackListProps extends Omit<TrackMenuHandlers, "onMoveUp" | "onMoveDown"> {
  items: VideoItem[];
  playingId: string | null;
  playing: boolean;
  onMove?: (item: VideoItem, dir: -1 | 1) => void;
}

export function TrackList({
  items,
  playingId,
  playing,
  onMove,
  ...handlers
}: TrackListProps) {
  return (
    <div className="track-list" data-testid="track-list" role="list" aria-label="歌曲列表">
      {items.map((item, index) => {
        const isPlaying = playing && playingId === item.id;
        const menu = buildTrackMenu(item, isPlaying, {
          ...handlers,
          onMoveUp: onMove && index > 0 ? (target) => onMove(target, -1) : undefined,
          onMoveDown: onMove && index < items.length - 1 ? (target) => onMove(target, 1) : undefined,
        });

        return (
          <Dropdown key={item.id} trigger={["contextMenu"]} menu={menu}>
            <div
              className={["track-row", isPlaying ? "is-playing" : ""].filter(Boolean).join(" ")}
              data-testid="track-row"
              data-id={item.id}
              data-playing={isPlaying || undefined}
              role="listitem"
              tabIndex={0}
              onClick={() => handlers.onToggle(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handlers.onToggle(item);
                }
              }}
            >
              <span className="track-index">{index + 1}</span>
              <img className="track-cover" src={item.cover} alt="" />
              <span className="track-title" title={item.title}>
                {item.title}
              </span>
              <span className="track-uploader" title={item.uploader}>
                {item.uploader}
              </span>
              <span className="track-duration">{formatDuration(item.duration)}</span>
            </div>
          </Dropdown>
        );
      })}
    </div>
  );
}
