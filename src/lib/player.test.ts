import { describe, expect, it, vi } from "vitest";
import { AudioPlayer, createAudioPlayer } from "./player";

class FakeAudio {
  src = "";
  currentTime = 0;
  duration = 0;
  paused = true;
  ended = false;
  volume = 1;
  private listeners = new Map<string, Set<() => void>>();

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

  it("pauses", () => {
    const { player, fake } = makePlayer();
    player.pause();
    expect(fake.paused).toBe(true);
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

  it("never throws when play() rejects", async () => {
    const fake = new FakeAudio();
    fake.play = () => Promise.reject(new Error("NotSupported"));
    const player = new AudioPlayer(fake as unknown as HTMLAudioElement);
    await expect(player.play("mock://x")).resolves.toBeUndefined();
  });
});
