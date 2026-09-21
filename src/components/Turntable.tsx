import { Dropdown, Modal } from "antd";
import type { MenuProps } from "antd";
import { PauseCircleFilled, PlayCircleFilled } from "@ant-design/icons";
import type { VideoItem } from "@/types";
import { formatDuration } from "@/lib/format";
import { VinylDisc } from "./VinylDisc";

interface TurntableProps {
  item: VideoItem;
  playing: boolean;
  onToggle: (item: VideoItem) => void;
  onDelete: (item: VideoItem) => void;
  onRename: (item: VideoItem) => void;
}

export function Turntable({ item, playing, onToggle, onDelete, onRename }: TurntableProps) {
  const classes = ["turntable", playing ? "is-playing" : ""].filter(Boolean).join(" ");

  const menu: MenuProps = {
    items: [
      { key: "toggle", label: playing ? "暂停" : "播放" },
      { key: "rename", label: "重命名" },
      { key: "delete", label: "删除", danger: true },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation();
      if (key === "toggle") onToggle(item);
      if (key === "rename") onRename(item);
      if (key === "delete") {
        Modal.confirm({
          title: "删除这条记录？",
          okText: "删除",
          cancelText: "取消",
          onOk: () => onDelete(item),
        });
      }
    },
  };

  return (
    <Dropdown trigger={["contextMenu"]} menu={menu}>
      <div
        className={classes}
        data-testid="turntable"
        data-id={item.id}
        data-playing={playing || undefined}
        onClick={() => onToggle(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(item);
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
