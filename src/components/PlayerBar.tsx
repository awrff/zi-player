import { Button, Slider, Tooltip } from "antd";
import { DeleteOutlined, PauseCircleFilled, PlayCircleFilled, SoundOutlined } from "@ant-design/icons";
import { formatDuration } from "@/lib/format";
import type { PlayerControls } from "@/hooks/usePlayer";

export function PlayerBar({
  controls,
  onDelete,
}: {
  controls: PlayerControls;
  onDelete: (id: string) => void;
}) {
  const { current, playing, currentTime, duration, volume, lastError, toggle, seek, setVolume } = controls;

  const isPlaying = playing;

  return (
    <footer className="player-bar" data-testid="player-bar">
      {current ? (
        <>
          <img className="player-cover" src={current.cover} alt="" />
          <div className="player-meta">
            <div className="player-title" title={current.title}>
              {current.title}
            </div>
            <div className="player-sub">{current.uploader}</div>
          </div>
          <div className="player-controls">
            <Tooltip title={isPlaying ? "暂停" : "播放"}>
              <Button
                type="text"
                shape="circle"
                size="large"
                aria-label={isPlaying ? "pause" : "play"}
                icon={isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
                onClick={() => void toggle(current)}
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                type="text"
                shape="circle"
                danger
                aria-label="delete"
                icon={<DeleteOutlined />}
                onClick={() => onDelete(current.id)}
              />
            </Tooltip>
          </div>
          <div className="player-progress">
            <span className="player-time">{formatDuration(currentTime)}</span>
            <Slider
              aria-label="seek"
              style={{ flex: 1 }}
              min={0}
              max={Math.max(duration, 1)}
              step={1}
              value={Math.min(currentTime, Math.max(duration, 1))}
              onChange={(v) => seek(v as number)}
              tooltip={{ formatter: (v) => formatDuration((v ?? 0) as number) }}
            />
            <span className="player-time">{formatDuration(duration)}</span>
          </div>
          <div className="player-controls">
            <SoundOutlined style={{ color: "var(--text-dim)" }} />
            <Slider
              aria-label="volume"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(v) => setVolume(v as number)}
              style={{ width: 90 }}
            />
          </div>
          {lastError ? (
            <span className="player-error" role="alert" data-testid="player-error" title={lastError}>
              {lastError}
            </span>
          ) : null}
        </>
      ) : lastError ? (
        <span className="player-error" role="alert" data-testid="player-error" title={lastError}>
          {lastError}
        </span>
      ) : (
        <span style={{ color: "var(--text-dim)", fontSize: 13 }}>未在播放</span>
      )}
    </footer>
  );
}
