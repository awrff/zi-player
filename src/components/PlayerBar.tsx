import { useEffect, useRef, useState } from "react";
import { Button, Slider, Tooltip } from "antd";
import {
  MutedOutlined,
  PauseCircleFilled,
  PlayCircleFilled,
  SoundOutlined,
  StepBackwardFilled,
  StepForwardFilled,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { formatDuration } from "@/lib/format";
import { repeatLabel, shuffleLabel } from "@/lib/playQueue";
import { PREPARING_HINT, type PlayerControls } from "@/hooks/usePlayer";
import { PlayQueue } from "./PlayQueue";

function ShuffleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 17h3l9-9h4" />
      <path d="m17.4 5.2 2.6 2.8-2.6 2.8" />
      <path d="M4 7h3l9 9h4" />
      <path d="m17.4 18.8 2.6-2.8-2.6-2.8" />
    </svg>
  );
}

function RepeatIcon({ mode }: { mode: PlayerControls["repeat"] }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6.5 11V8.2A2.7 2.7 0 0 1 9.2 5.5H19.4" />
      <path d="m16.2 3.1 3.2 2.4-3.2 2.4" />
      <path d="M17.5 13V15.8A2.7 2.7 0 0 1 14.8 18.5H4.6" />
      <path d="m7.8 20.9-3.2-2.4 3.2-2.4" />
      {mode === "one" ? <path d="M10.8 11 12 9.6v5" /> : null}
    </svg>
  );
}

export function PlayerBar({ controls }: { controls: PlayerControls }) {
  const {
    current,
    playing,
    currentTime,
    duration,
    volume,
    lastError,
    preparing,
    shuffle,
    repeat,
    queue,
    canPrev,
    canNext,
    toggle,
    playId,
    playNext,
    playPrev,
    seek,
    setVolume,
    setShuffle,
    cycleRepeat,
    removeFromQueue,
  } = controls;

  const [queueOpen, setQueueOpen] = useState(false);
  const queueWrapRef = useRef<HTMLDivElement>(null);
  const lastVolumeRef = useRef(volume > 0 ? volume : 1);
  if (volume > 0) lastVolumeRef.current = volume;
  const muted = volume === 0;

  useEffect(() => {
    if (!queueOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!queueWrapRef.current?.contains(event.target as Node)) setQueueOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [queueOpen]);

  const isPlaying = playing;
  const status = preparing ? (
    <span className="player-status" role="status" data-testid="player-preparing">
      {PREPARING_HINT}
    </span>
  ) : lastError ? (
    <span className="player-error" role="alert" data-testid="player-error" title={lastError}>
      {lastError}
    </span>
  ) : null;

  return (
    <footer className="player-bar" data-testid="player-bar">
      <div className="player-left">
        {current ? (
          <>
            <img className="player-cover" src={current.cover} alt="" />
            <div className="player-meta">
              <div className="player-title" title={current.title}>
                {current.title}
              </div>
              <div className="player-sub">{current.uploader}</div>
              {status}
            </div>
          </>
        ) : status ? (
          status
        ) : (
          <span className="player-idle">未在播放</span>
        )}
      </div>

      <div className="player-center">
        <div className="player-transport">
          <Tooltip title={shuffleLabel(shuffle)}>
            <Button
              type="text"
              shape="circle"
              size="small"
              aria-label="shuffle"
              aria-pressed={shuffle}
              className={shuffle ? "player-mode is-active" : "player-mode"}
              icon={<ShuffleIcon />}
              onClick={() => setShuffle(!shuffle)}
            />
          </Tooltip>
          <Tooltip title="上一首">
            <Button
              type="text"
              shape="circle"
              aria-label="previous"
              disabled={!canPrev}
              icon={<StepBackwardFilled />}
              onClick={() => void playPrev()}
            />
          </Tooltip>
          <Tooltip title={current ? (isPlaying ? "暂停" : "播放") : "播放"}>
            <Button
              type="text"
              shape="circle"
              size="large"
              className="player-play"
              aria-label={isPlaying ? "pause" : "play"}
              disabled={!current}
              icon={isPlaying ? <PauseCircleFilled /> : <PlayCircleFilled />}
              onClick={() => current && void toggle(current)}
            />
          </Tooltip>
          <Tooltip title="下一首">
            <Button
              type="text"
              shape="circle"
              aria-label="next"
              disabled={!canNext}
              icon={<StepForwardFilled />}
              onClick={() => void playNext()}
            />
          </Tooltip>
          <Tooltip title={repeatLabel(repeat)}>
            <Button
              type="text"
              shape="circle"
              size="small"
              aria-label="repeat"
              aria-pressed={repeat !== "off"}
              className={repeat !== "off" ? "player-mode is-active" : "player-mode"}
              icon={<RepeatIcon mode={repeat} />}
              onClick={cycleRepeat}
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
            disabled={!current}
            value={Math.min(currentTime, Math.max(duration, 1))}
            onChange={(v) => seek(v as number)}
            tooltip={{ formatter: (v) => formatDuration((v ?? 0) as number) }}
          />
          <span className="player-time">{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="player-right">
        <div className="player-volume">
          <Tooltip title={muted ? "取消静音" : "静音"}>
            <Button
              type="text"
              shape="circle"
              size="small"
              aria-label={muted ? "unmute" : "mute"}
              className="player-mode"
              icon={muted ? <MutedOutlined /> : <SoundOutlined />}
              onClick={() => setVolume(muted ? lastVolumeRef.current : 0)}
            />
          </Tooltip>
          <Slider
            aria-label="volume"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(v) => setVolume(v as number)}
            tooltip={{ formatter: (v) => `${Math.round(((v ?? 0) as number) * 100)}%` }}
            style={{ width: 88 }}
          />
        </div>
        <div className="play-queue-wrap" ref={queueWrapRef}>
          <Tooltip title="播放列表">
            <Button
              type="text"
              shape="circle"
              aria-label="queue"
              aria-expanded={queueOpen}
              className={queueOpen ? "player-mode is-active" : "player-mode"}
              icon={<UnorderedListOutlined />}
              onClick={() => setQueueOpen((open) => !open)}
            />
          </Tooltip>
          {queueOpen ? (
            <div className="play-queue-panel">
              <PlayQueue
                items={queue}
                currentId={current?.id ?? null}
                playing={isPlaying}
                onPlay={(item) => {
                  if (item.id === current?.id) void toggle(item);
                  else void playId(item.id);
                }}
                onRemove={removeFromQueue}
              />
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
