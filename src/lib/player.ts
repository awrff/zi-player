type Listener = () => void;

/**
 * Thin wrapper around a single <audio> element with a tiny pub/sub so React
 * components can subscribe to playback state without prop drilling.
 *
 * The audio element is injected through `makeAudio` so unit tests can provide
 * a fake implementation of HTMLAudioElement.
 */
export class AudioPlayer {
  private audio: HTMLAudioElement;
  private listeners = new Set<Listener>();

  constructor(audio: HTMLAudioElement) {
    this.audio = audio;
    audio.addEventListener("timeupdate", this.emit);
    audio.addEventListener("loadedmetadata", this.emit);
    audio.addEventListener("play", this.emit);
    audio.addEventListener("pause", this.emit);
    audio.addEventListener("ended", this.emit);
    audio.addEventListener("error", this.emit);
  }

  private emit = () => {
    this.listeners.forEach((fn) => fn());
  };

  /** Subscribe to any playback change; returns an unsubscribe function. */
  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /** Subscribe to track end; returns an unsubscribe function. */
  onEnded = (cb: () => void): (() => void) => {
    const wrapped = () => {
      if (this.audio.ended) cb();
    };
    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  };

  async play(src: string): Promise<void> {
    try {
      if (this.audio.src !== src) {
        this.audio.src = src;
        this.audio.currentTime = 0;
      }
      await this.audio.play();
    } catch {
      // Playback failure is surfaced by the caller; never throw out of here.
    }
  }

  pause(): void {
    this.audio.pause();
  }

  seek(seconds: number): void {
    if (Number.isFinite(seconds)) {
      this.audio.currentTime = Math.max(0, seconds);
    }
  }

  setVolume(value: number): void {
    this.audio.volume = Math.min(1, Math.max(0, value));
  }

  get currentTime(): number {
    return this.audio.currentTime || 0;
  }

  get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  get paused(): boolean {
    return this.audio.paused;
  }

  get ended(): boolean {
    return this.audio.ended;
  }

  get volume(): number {
    return this.audio.volume;
  }
}

export function createAudioPlayer(makeAudio: () => HTMLAudioElement = () => new Audio()): AudioPlayer {
  return new AudioPlayer(makeAudio());
}

/** Shared singleton used by the app. */
export const player = createAudioPlayer();
