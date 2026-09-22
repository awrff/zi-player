import { Checkbox, Dropdown, Progress } from "antd";
import { CheckCircleFilled, CloseCircleFilled } from "@ant-design/icons";
import type { VideoItem } from "@/types";
import { formatDuration } from "@/lib/format";
import { importStatusLabel, isImportPending, isPlayable, normalizeImportStatus } from "@/lib/importStatus";
import { selectModifiers } from "@/lib/selection";
import { buildTrackMenu, type TrackMenuHandlers } from "./trackContextMenu";
import type { TrackSelectionView } from "./trackSelection";

interface TrackListProps extends Omit<TrackMenuHandlers, "onMoveUp" | "onMoveDown"> {
  items: VideoItem[];
  playingId: string | null;
  playing: boolean;
  onMove?: (item: VideoItem, dir: -1 | 1) => void;
  selection?: TrackSelectionView;
}

export function TrackList({
  items,
  playingId,
  playing,
  onMove,
  selection,
  ...handlers
}: TrackListProps) {
  return (
    <div className="track-list" data-testid="track-list" role="list" aria-label="歌曲列表">
      {items.map((item, index) => {
        const isPlaying = playing && playingId === item.id;
        const status = normalizeImportStatus(item);
        const playable = isPlayable(item);
        const pending = isImportPending(status);
        const failed = status === "failed";
        const selected = Boolean(selection?.selectedIds.has(item.id));
        const menu =
          selected && selection?.batchMenu
            ? selection.batchMenu
            : buildTrackMenu(item, isPlaying, {
                ...handlers,
                onMoveUp: onMove && index > 0 ? (target) => onMove(target, -1) : undefined,
                onMoveDown: onMove && index < items.length - 1 ? (target) => onMove(target, 1) : undefined,
              });

        return (
          <Dropdown key={item.id} trigger={["contextMenu"]} menu={menu}>
            <div
              className={[
                "track-row",
                isPlaying ? "is-playing" : "",
                pending ? "is-pending" : "",
                failed ? "is-failed" : "",
                selection?.selecting ? "is-selecting" : "",
                selected ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-testid="track-row"
              data-id={item.id}
              data-playing={isPlaying || undefined}
              data-selected={selected || undefined}
              data-import-status={status}
              data-ready={playable || undefined}
              role="listitem"
              tabIndex={0}
              aria-disabled={(!playable && !failed && !selection?.selecting) || undefined}
              onClick={(event) => {
                if (selection) {
                  const action = selection.onSelectClick(item, selectModifiers(event));
                  if (action === "select") return;
                }
                if (failed) handlers.onRetry?.(item);
                else handlers.onToggle(item);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                if (selection?.selecting) {
                  selection.onSelectToggle(item);
                  return;
                }
                if (failed) handlers.onRetry?.(item);
                else handlers.onToggle(item);
              }}
            >
              <span className="track-select">
                <span className="track-index">{index + 1}</span>
                {selection ? (
                  <span
                    className="track-check"
                    data-testid="track-check"
                    onClick={(event) => {
                      event.stopPropagation();
                      selection.onSelectToggle(item);
                    }}
                  >
                    <Checkbox checked={selected} tabIndex={-1} />
                  </span>
                ) : null}
              </span>
              <span className="track-cover-wrap">
                {item.cover ? (
                  <img className="track-cover" src={item.cover} alt="" />
                ) : (
                  <span className="track-cover track-cover-placeholder" />
                )}
                {status === "ready" ? (
                  <span className="track-cache-badge" data-testid="cache-badge" title="已缓存">
                    <CheckCircleFilled />
                  </span>
                ) : null}
              </span>
              <span className="track-title" title={item.title}>
                {item.title}
              </span>
              <span className="track-uploader" title={item.uploader}>
                {item.uploader}
              </span>
              <span className="track-duration">
                {pending ? (
                  <span className="track-import" data-testid="import-status">
                    <Progress type="circle" size={16} percent={item.importProgress ?? 0} />
                    {importStatusLabel(status)}
                  </span>
                ) : failed ? (
                  <span className="track-import" data-testid="import-status">
                    <CloseCircleFilled />
                    导入失败
                  </span>
                ) : (
                  formatDuration(item.duration)
                )}
              </span>
            </div>
          </Dropdown>
        );
      })}
    </div>
  );
}
