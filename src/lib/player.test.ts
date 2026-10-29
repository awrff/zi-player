import { describe, expect, it, vi } from "vitest";
import { AudioPlayer, createAudioPlayer } from "./player";

class FakeAudio {
  private source = "";
  currentTime = 0;
  duration = 0;
  paused = true;
  ended = false;
  volume = 1;
  private listeners = new Map<string, Set<() => void>>();

  get src() {
    return this.source;
  }

  /** Mimic the browser: canonicalize separators and reset playback on a new source. */
  set src(value: string) {
    this.source = value.replace(/\\/g, "/");
    this.currentTime = 0;
  }

  addEventListener(type: string, cb: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  removeEventListener() {}

  emit(type: string) {
    this.listeners.get(type)?.forEach((cb) => cb());
  }

  play() {
    this.paused = false;
    this.emit("play");
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.emit("pause");
  }
}

function makePlayer(): { player: AudioPlayer; fake: FakeAudio } {
  const fake = new FakeAudio();
  const player = createAudioPlayer(() => fake as unknown as HTMLAudioElement);
  return { player, fake };
}

describe("AudioPlayer", () => {
  it("sets src then plays", async () => {
    const { player, fake } = makePlayer();
    await player.play("mock://a");
    expect(fake.src).toBe("mock://a");
    expect(fake.paused).toBe(false);
  });

  it("does not reset currentTime when replaying the same src", async () => {
    const { player, fake } = makePlayer();
    await player.play("mock://a");
    fake.currentTime = 42;
    await player.play("mock://a");
    expect(fake.currentTime).toBe(42);
  });

  it("resumes a Windows URL after the browser canonicalizes its separators", async () => {
    const src = String.raw`http://127.0.0.1:1234/audio\BV1xx411c7mD.ogg`;
    const { player, fake } = makePlayer();
    await player.play(src);
    expect(fake.src).toBe("http://127.0.0.1:1234/audio/BV1xx411c7mD.ogg");

    fake.currentTime = 42;
    player.pause();
    await player.play(src);

    expect(fake.currentTime).toBe(42);
    expect(fake.paused).toBe(false);
  });

  it("restarts from zero when switching to a different src", async () => {
    const { player, fake } = makePlayer();
    await player.play("mock://a");
    fake.currentTime = 42;
    await player.play("mock://b");
    expect(fake.currentTime).toBe(0);
  });

  it("pauses", () => {
    const { player, fake } = makePlayer();
    player.pause();
    expect(fake.paused).toBe(true);
  });

  it("replays from the start without changing src", async () => {
    const { player, fake } = makePlayer();
    await player.play("mock://a");
    fake.currentTime = 42;
    await player.replay();
    expect(fake.src).toBe("mock://a");
    expect(fake.currentTime).toBe(0);
    expect(fake.paused).toBe(false);
  });

  it("seeks and clamps volume", () => {
    const { player, fake } = makePlayer();
    player.seek(30);
    expect(fake.currentTime).toBe(30);

    player.setVolume(1.5);
    expect(fake.volume).toBe(1);
    player.setVolume(-1);
    expect(fake.volume).toBe(0);
    player.setVolume(0.4);
    expect(fake.volume).toBe(0.4);
  });

  it("notifies subscribers on timeupdate", () => {
    const { player, fake } = makePlayer();
    const cb = vi.fn();
    player.subscribe(cb);
    fake.currentTime = 5;
    fake.emit("timeupdate");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("fires onEnded only when ended", () => {
    const { player, fake } = makePlayer();
    const cb = vi.fn();
    player.onEnded(cb);
    fake.emit("ended");
    expect(cb).not.toHaveBeenCalled();

    fake.ended = true;
    fake.emit("ended");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not fire onEnded again when pause or timeupdate follows the ended event", () => {
    const { player, fake } = makePlayer();
    const cb = vi.fn();
    player.onEnded(cb);

    fake.ended = true;
    fake.emit("ended");
    expect(cb).toHaveBeenCalledTimes(1);

    // Loading the next source fires pause while audio.ended is still true.
    fake.paused = true;
    fake.emit("pause");
    fake.emit("timeupdate");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("allows onEnded to fire again after playing a new source", async () => {
    const { player, fake } = makePlayer();
    const cb = vi.fn();
    player.onEnded(cb);

    fake.ended = true;
    fake.emit("ended");
    expect(cb).toHaveBeenCalledTimes(1);

    fake.ended = false;
    await player.play("mock://b");
    expect(cb).toHaveBeenCalledTimes(1);

    fake.ended = true;
    fake.emit("ended");
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("propagates play() rejection so the UI can show it", async () => {
    const fake = new FakeAudio();
    fake.play = () => Promise.reject(new Error("NotSupported"));
    const player = new AudioPlayer(fake as unknown as HTMLAudioElement);
    await expect(player.play("mock://x")).rejects.toThrow("NotSupported");
  });
});
