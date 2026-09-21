import { Dropdown } from "antd";
import { PauseCircleFilled, PlayCircleFilled } from "@ant-design/icons";
import type { VideoItem } from "@/types";
import { formatDuration } from "@/lib/format";
import { VinylDisc } from "./VinylDisc";
import { buildTrackMenu, type TrackMenuHandlers } from "./trackContextMenu";

interface TurntableProps extends TrackMenuHandlers {
  item: VideoItem;
  playing: boolean;
}

export function Turntable({ item, playing, ...handlers }: TurntableProps) {
  const classes = ["turntable", playing ? "is-playing" : ""].filter(Boolean).join(" ");

  return (
    <Dropdown trigger={["contextMenu"]} menu={buildTrackMenu(item, playing, handlers)}>
      <div
        className={classes}
        data-testid="turntable"
        data-id={item.id}
        data-playing={playing || undefined}
        onClick={() => handlers.onToggle(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handlers.onToggle(item);
          }
        }}
      >
        <div className="turntable-cover-wrap">
          <img className="turntable-cover" src={item.cover} alt={item.title} draggable={false} />
          <span className="turntable-play" data-testid="turntable-play" aria-hidden>
            {playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
          </span>
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
          {item.uploader} · {formatDuration(item.duration)}
        </p>
      </div>
    </Dropdown>
  );
}
