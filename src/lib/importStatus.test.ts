import { describe, expect, it } from "vitest";
import type { VideoItem } from "@/types";
import { durableImportStatus, importStatusLabel, isPlayable, isReusableAudioCache, normalizeImportStatus } from "./importStatus";

const base: VideoItem = {
  id: "BV1",
  url: "https://www.bilibili.com/video/BV1",
  title: "歌",
  uploader: "UP",
  duration: 10,
  cover: "x",
  addedAt: 1,
};

describe("importStatus", () => {
  it("treats reusable cache as ready and playable", () => {
    const item = { ...base, cachePath: "/data/audio/BV1.ogg" };
    expect(isReusableAudioCache(item.cachePath)).toBe(true);
    expect(normalizeImportStatus(item)).toBe("ready");
    expect(isPlayable(item)).toBe(true);
  });

  it("keeps failed even when a stale path exists", () => {
    const item = { ...base, cachePath: "/data/audio/BV1.m4a", importStatus: "failed" as const };
    expect(normalizeImportStatus(item)).toBe("failed");
    expect(isPlayable(item)).toBe(false);
  });

  it("maps in-progress statuses back to queued for persist", () => {
    expect(durableImportStatus({ ...base, importStatus: "transcoding" })).toBe("queued");
    expect(durableImportStatus({ ...base, importStatus: "failed", importError: "x" })).toBe("failed");
    expect(durableImportStatus({ ...base, cachePath: "data:audio/wav;base64,x" })).toBe("ready");
  });

  it("labels each stage in Chinese", () => {
    expect(importStatusLabel("queued")).toMatch(/等待/);
    expect(importStatusLabel("resolving")).toMatch(/解析/);
    expect(importStatusLabel("transcoding")).toMatch(/转码/);
    expect(importStatusLabel("failed")).toMatch(/失败/);
    expect(importStatusLabel("ready")).toMatch(/缓存/);
  });
});
