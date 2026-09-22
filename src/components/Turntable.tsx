import { Checkbox, Dropdown, Progress } from "antd";
import { CheckCircleFilled, CloseCircleFilled, PauseCircleFilled, PlayCircleFilled } from "@ant-design/icons";
import type { VideoItem } from "@/types";
import { formatDuration } from "@/lib/format";
import { importStatusLabel, isImportPending, isPlayable, normalizeImportStatus } from "@/lib/importStatus";
import { selectModifiers } from "@/lib/selection";
import { VinylDisc } from "./VinylDisc";
import { buildTrackMenu, type TrackMenuHandlers } from "./trackContextMenu";
import type { TrackSelectionView } from "./trackSelection";

interface TurntableProps extends TrackMenuHandlers {
  item: VideoItem;
  playing: boolean;
  selection?: TrackSelectionView;
}

export function Turntable({ item, playing, selection, ...handlers }: TurntableProps) {
  const status = normalizeImportStatus(item);
  const playable = isPlayable(item);
  const pending = isImportPending(status);
  const failed = status === "failed";
  const selected = Boolean(selection?.selectedIds.has(item.id));
  const classes = [
    "turntable",
    playing ? "is-playing" : "",
    pending ? "is-pending" : "",
    failed ? "is-failed" : "",
    selection?.selecting ? "is-selecting" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const activate = () => {
    if (failed) {
      handlers.onRetry?.(item);
      return;
    }
    handlers.onToggle(item);
  };

  const menu = selected && selection?.batchMenu ? selection.batchMenu : buildTrackMenu(item, playing, handlers);

  return (
    <Dropdown trigger={["contextMenu"]} menu={menu}>
      <div
        className={classes}
        data-testid="turntable"
        data-id={item.id}
        data-playing={playing || undefined}
        data-selected={selected || undefined}
        data-import-status={status}
        data-ready={playable || undefined}
        aria-disabled={(!playable && !failed && !selection) || undefined}
        onClick={(event) => {
          if (selection) {
            const action = selection.onSelectClick(item, selectModifiers(event));
            if (action === "select") return;
          }
          activate();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (selection?.selecting) {
            selection.onSelectToggle(item);
            return;
          }
          activate();
        }}
      >
        {selection ? (
          <span
            className="turntable-check"
            data-testid="track-check"
            onClick={(event) => {
              event.stopPropagation();
              selection.onSelectToggle(item);
            }}
          >
            <Checkbox checked={selected} tabIndex={-1} />
          </span>
        ) : null}
        <div className="turntable-cover-wrap">
          {item.cover ? (
            <img className="turntable-cover" src={item.cover} alt={item.title} draggable={false} />
          ) : (
            <div className="turntable-cover turntable-cover-placeholder" aria-hidden />
          )}
          {pending ? (
            <div className="turntable-import" data-testid="import-status">
              <Progress type="circle" size={44} percent={item.importProgress ?? 0} />
              <span>{importStatusLabel(status)}</span>
            </div>
          ) : null}
          {failed ? (
            <div className="turntable-import" data-testid="import-status">
              <CloseCircleFilled />
              <span>导入失败</span>
            </div>
          ) : null}
          {status === "ready" ? (
            <span className="turntable-cache-badge" data-testid="cache-badge" title="已缓存">
              <CheckCircleFilled />
            </span>
          ) : null}
          {playable && !selection?.selecting ? (
            <span className="turntable-play" data-testid="turntable-play" aria-hidden>
              {playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
            </span>
          ) : null}
        </div>

        <div className="turntable-deck">
          <div className="tonearm" aria-hidden>
            <span className="tonearm-head" />
          </div>
          <VinylDisc spinning={playing} />
        </div>

        <p className="turntable-title" title={item.title}>
          {item.title}
        </p>
        <p className="turntable-meta">
          {pending || failed
            ? importStatusLabel(status)
            : `${item.uploader}${item.uploader ? " · " : ""}${formatDuration(item.duration)}`}
        </p>
      </div>
    </Dropdown>
  );
}
