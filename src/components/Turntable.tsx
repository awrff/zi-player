import { Button, Popconfirm, Tooltip } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PauseCircleFilled,
  PlayCircleFilled,
} from "@ant-design/icons";
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

/**
 * One record on the board: cover on top (does not hide the whole deck),
 * spinning vinyl disc beneath it, title directly below.
 */
export function Turntable({ item, playing, onToggle, onDelete, onRename }: TurntableProps) {
  const classes = ["turntable", playing ? "is-playing" : ""].filter(Boolean).join(" ");

  return (
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
      <div
        className="turntable-actions"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Tooltip title={playing ? "暂停" : "播放"}>
          <Button
            size="small"
            shape="circle"
            type="text"
            aria-label={playing ? "pause" : "play"}
            icon={playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
            onClick={() => onToggle(item)}
          />
        </Tooltip>
        <Tooltip title="重命名">
          <Button
            size="small"
            shape="circle"
            type="text"
            aria-label="rename"
            icon={<EditOutlined />}
            onClick={() => onRename(item)}
          />
        </Tooltip>
        <Popconfirm
          title="删除这条记录？"
          okText="删除"
          cancelText="取消"
          onConfirm={() => onDelete(item)}
        >
          <Button
            size="small"
            shape="circle"
            type="text"
            danger
            aria-label="delete"
            icon={<DeleteOutlined />}
          />
        </Popconfirm>
      </div>

      <div className="turntable-cover-wrap">
        <img className="turntable-cover" src={item.cover} alt={item.title} draggable={false} />
      </div>

      <div className="turntable-deck">
        <div className="tonearm" />
        <VinylDisc spinning={playing} />
      </div>

      <p className="turntable-title" title={item.title}>
        {item.title}
      </p>
      <p className="turntable-meta">
        {item.uploader} · {formatDuration(item.duration)}
      </p>
    </div>
  );
}
