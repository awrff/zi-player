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
  /** Last source requested via `play`; the DOM may normalize it (e.g. `\` → `/`). */
  private requestedSrc: string | null = null;
  private listeners = new Set<Listener>();
  private endedListeners = new Set<Listener>();
  private errorListeners = new Set<(event: Event) => void>();
  /** Guards against duplicate `ended` callbacks within one playback session. */
  private endedFired = false;

  constructor(audio: HTMLAudioElement) {
    this.audio = audio;
    audio.addEventListener("timeupdate", this.emit);
    audio.addEventListener("loadedmetadata", this.emit);
    audio.addEventListener("play", this.emit);
    audio.addEventListener("pause", this.emit);
    audio.addEventListener("ended", this.handleEnded);
    audio.addEventListener("error", this.handleError);
  }

  /**
   * `ended` must be handled as an event, not as a flag checked from every
   * other event. Loading a new source fires `pause` while `audio.ended` is
   * still true, which used to invoke the end callback a second time and skip
   * a track.
   */
  private handleEnded = () => {
    this.emit();
    if (!this.audio.ended || this.endedFired) return;
    this.endedFired = true;
    this.endedListeners.forEach((fn) => fn());
  };

  private emit = () => {
    this.listeners.forEach((fn) => fn());
  };

  private handleError = (event: Event) => {
    this.emit();
    this.errorListeners.forEach((fn) => fn(event));
  };

  /** Subscribe to any playback change; returns an unsubscribe function. */
  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /** Subscribe to track end; returns an unsubscribe function. */
  onEnded = (cb: () => void): (() => void) => {
    this.endedListeners.add(cb);
    return () => this.endedListeners.delete(cb);
  };

  /** Subscribe to media decode/load errors; the callback receives the `MediaError` code and message. */
  onError = (cb: (code: number | null, message: string) => void): (() => void) => {
    const wrapped = () => cb(this.audio.error?.code ?? null, this.audio.error?.message ?? "");
    this.errorListeners.add(wrapped);
    return () => this.errorListeners.delete(wrapped);
  };

  async play(src: string): Promise<void> {
    // Compare against the requested source, not `audio.src`: browsers rewrite
    // Windows backslashes and escape URL characters, so the normalized value
    // never matches the original and would restart paused tracks from zero.
    if (this.requestedSrc !== src) {
      this.requestedSrc = src;
      this.audio.src = src;
      this.audio.currentTime = 0;
    }
    this.endedFired = false;
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  async replay(): Promise<void> {
    this.endedFired = false;
    this.audio.currentTime = 0;
    await this.audio.play();
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
