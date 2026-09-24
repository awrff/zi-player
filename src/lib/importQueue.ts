import { classifyImportError } from "./importError";
import { isImportPending, isReusableAudioCache, normalizeImportStatus } from "./importStatus";
import { native } from "./native";
import { extractVideoId, isVideoUrl, normalizeVideoUrl } from "./parser";
import { formatSidecarGuidance } from "./sidecarError";
import { useVideoStore } from "@/store/videoStore";
import type { CollectionEpisode, ImportResult, ImportStatus } from "@/types";

const STAGE_SPAN: Record<"resolving" | "transcoding", { start: number; end: number; ms: number }> = {
  resolving: { start: 0, end: 25, ms: 8000 },
  transcoding: { start: 25, end: 90, ms: 30000 },
};

const DEFAULT_CONCURRENCY = 3;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 6;

const pendingIds: string[] = [];
const cancelled = new Set<string>();
const activeIds = new Set<string>();
const progressTimers = new Map<string, ReturnType<typeof setInterval>>();
let maxConcurrency = DEFAULT_CONCURRENCY;
let failHandler: ((title: string, detail: string) => void) | null = null;

/** Number of imports allowed to run at once (network-bound; clamped 1–6). */
export function setImportConcurrency(n: number): void {
  const clamped = Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.floor(n)));
  if (clamped === maxConcurrency) return;
  maxConcurrency = clamped;
  pump();
}

export function onImportFailed(handler: (title: string, detail: string) => void): () => void {
  failHandler = handler;
  return () => {
    if (failHandler === handler) failHandler = null;
  };
}

export function cancelImport(id: string): void {
  cancelled.add(id);
  const index = pendingIds.indexOf(id);
  if (index >= 0) pendingIds.splice(index, 1);
  // Also kill the sidecar actually running for this import (no-op when the
  // job is still queued or already finished).
  void native.cancelImport(id).catch(() => {});
}

export function resetImportQueue(): void {
  pendingIds.length = 0;
  cancelled.clear();
  activeIds.clear();
  for (const timer of progressTimers.values()) clearInterval(timer);
  progressTimers.clear();
}

export function enqueueImport(rawUrl: string): ImportResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, reason: "not-a-url" };
  if (!isVideoUrl(trimmed)) return { ok: false, reason: "unsupported-url" };

  const id = extractVideoId(trimmed);
  const url = normalizeVideoUrl(trimmed);
  if (!id || !url) return { ok: false, reason: "unsupported-url" };
  if (useVideoStore.getState().has(id)) return { ok: false, reason: "duplicate" };

  const item = useVideoStore.getState().addVideo({
    id,
    url,
    title: id,
    uploader: "",
    duration: 0,
    cover: "",
  });
  if (!item) return { ok: false, reason: "duplicate" };

  queueId(item.id);
  void pump();
  return { ok: true, item };
}

export interface EpisodeEnqueueResult {
  queued: number;
  skipped: number;
}

/** Enqueue the selected episodes of a probed collection. Multi-P episodes
 * become `?p=N` jobs keyed `BVxxx_pN` — the same id yt-dlp later resolves, so
 * the resolve step never retargets them; list episodes are separate BVs.
 * Titles and durations are prefilled from the probe so cards are meaningful
 * while queued. Already-present ids are skipped, not errors. */
export function enqueueEpisodes(selected: CollectionEpisode[]): EpisodeEnqueueResult {
  let queued = 0;
  let skipped = 0;
  for (const ep of selected) {
    const id = ep.page != null ? `${ep.bvid}_p${ep.page}` : ep.bvid;
    const url =
      ep.page != null
        ? `https://www.bilibili.com/video/${ep.bvid}?p=${ep.page}`
        : `https://www.bilibili.com/video/${ep.bvid}`;
    if (useVideoStore.getState().has(id)) {
      skipped += 1;
      continue;
    }
    const item = useVideoStore.getState().addVideo({
      id,
      url,
      title: ep.title,
      uploader: "",
      duration: ep.duration,
      cover: "",
    });
    if (!item) {
      skipped += 1;
      continue;
    }
    queueId(item.id);
    queued += 1;
  }
  if (queued > 0) void pump();
  return { queued, skipped };
}

export function retryImport(id: string): void {
  if (activeIds.has(id)) return;
  const item = useVideoStore.getState().items.find((entry) => entry.id === id);
  if (!item) return;
  cancelled.delete(id);
  useVideoStore.getState().setImportState(id, { status: "queued", progress: 0, error: undefined });
  queueId(id);
  void pump();
}

export function resumeIncompleteImports(): void {
  for (const item of useVideoStore.getState().items) {
    const status = normalizeImportStatus(item);
    if (!isImportPending(status)) continue;
    if (activeIds.has(item.id)) continue;
    useVideoStore.getState().setImportState(item.id, { status: "queued", progress: 0, error: undefined });
    queueId(item.id);
  }
  void pump();
}

function queueId(id: string): void {
  if (!pendingIds.includes(id)) pendingIds.push(id);
}

function retargetId(fromId: string, toId: string): void {
  const index = pendingIds.indexOf(fromId);
  if (index >= 0) pendingIds[index] = toId;
  if (cancelled.has(fromId)) {
    cancelled.delete(fromId);
    cancelled.add(toId);
  }
  if (activeIds.has(fromId)) {
    activeIds.delete(fromId);
    activeIds.add(toId);
  }
  const timer = progressTimers.get(fromId);
  if (timer !== undefined) {
    progressTimers.delete(fromId);
    progressTimers.set(toId, timer);
  }
}

function stillActive(id: string): boolean {
  return !cancelled.has(id) && useVideoStore.getState().has(id);
}

function stopProgress(id?: string): void {
  if (id === undefined) {
    for (const timer of progressTimers.values()) clearInterval(timer);
    progressTimers.clear();
    return;
  }
  const timer = progressTimers.get(id);
  if (timer !== undefined) {
    clearInterval(timer);
    progressTimers.delete(id);
  }
}

function startProgress(id: string, stage: "resolving" | "transcoding"): void {
  stopProgress(id);
  const { start, end, ms } = STAGE_SPAN[stage];
  const begun = Date.now();
  const timer = setInterval(() => {
    if (!stillActive(id)) {
      stopProgress(id);
      return;
    }
    const ratio = Math.min(1, (Date.now() - begun) / ms);
    useVideoStore.getState().setImportState(id, {
      status: stage,
      progress: Math.round(start + (end - start) * ratio),
    });
  }, 500);
  progressTimers.set(id, timer);
}

function failItem(id: string, status: ImportStatus, detail: string): void {
  stopProgress(id);
  if (!useVideoStore.getState().has(id)) return;
  const title = useVideoStore.getState().items.find((item) => item.id === id)?.title ?? id;
  useVideoStore.getState().setImportState(id, { status, progress: 0, error: detail });
  failHandler?.(title, detail);
}

function jobError(err: unknown, phase: "resolving" | "transcoding"): string {
  const sidecar = formatSidecarGuidance(err);
  if (sidecar) return sidecar;
  const classified = classifyImportError(err);
  if (phase === "resolving") return classified.detail;
  if (classified.reason === "network" || classified.reason === "access" || classified.reason === "unavailable") {
    return classified.detail;
  }
  return "下载转码失败，请稍后重试";
}

async function runJob(id: string): Promise<void> {
  let workingId = id;
  try {
    if (!stillActive(id)) return;
    const store = useVideoStore.getState();
    const item = store.items.find((entry) => entry.id === id);
    if (!item) return;

    store.setImportState(workingId, { status: "resolving", progress: 0 });
    startProgress(workingId, "resolving");

    const meta = await native.resolveVideo(item.url);
    if (!stillActive(workingId)) return;

    if (meta.id !== workingId) {
      if (useVideoStore.getState().has(meta.id)) {
        useVideoStore.getState().removeVideo(workingId);
        return;
      }
      if (!useVideoStore.getState().replaceVideoId(workingId, meta.id)) {
        failItem(workingId, "failed", "该视频已在看板上，无需重复添加");
        return;
      }
      retargetId(workingId, meta.id);
      workingId = meta.id;
    }

    useVideoStore.getState().patchVideo(workingId, {
      title: meta.title,
      uploader: meta.uploader,
      duration: meta.duration,
      url: meta.url,
      cover: meta.cover,
    });

    try {
      const cover = await native.fetchCover(meta.id, meta.url);
      if (cover && stillActive(workingId)) {
        useVideoStore.getState().patchVideo(workingId, { cover });
      }
    } catch {
      // keep remote cover
    }

    if (!stillActive(workingId)) return;

    const latest = useVideoStore.getState().items.find((entry) => entry.id === workingId);
    if (latest && isReusableAudioCache(latest.cachePath)) {
      useVideoStore.getState().setImportState(workingId, { status: "ready", progress: 100 });
      return;
    }

    useVideoStore.getState().setImportState(workingId, { status: "transcoding", progress: 25 });
    startProgress(workingId, "transcoding");

    const path = await native.downloadAudio(workingId, meta.url, meta.duration > 0 ? meta.duration : undefined);
    if (!stillActive(workingId)) return;
    useVideoStore.getState().setCachePath(workingId, path);
    useVideoStore.getState().setImportState(workingId, { status: "ready", progress: 100 });
  } catch (err) {
    const phase =
      useVideoStore.getState().items.find((entry) => entry.id === workingId)?.importStatus === "transcoding"
        ? "transcoding"
        : "resolving";
    failItem(workingId, "failed", jobError(err, phase));
  } finally {
    stopProgress(workingId);
    activeIds.delete(workingId);
    activeIds.delete(id);
    pump();
  }
}

/** Start as many queued jobs as free worker slots allow. Synchronous and
 * re-entrant safe: it never awaits and `runJob`'s cleanup runs before it
 * pulls the next id. */
function pump(): void {
  while (activeIds.size < maxConcurrency && pendingIds.length > 0) {
    const id = pendingIds.shift();
    if (id === undefined) break;
    if (cancelled.has(id)) {
      cancelled.delete(id);
      continue;
    }
    if (activeIds.has(id)) continue;
    activeIds.add(id);
    void runJob(id);
  }
}

// Real sidecar progress (Rust `import-progress` events), routed by working id.
// The first real event retires that job's fake timer; the timers stay as the
// fallback for the resolve phase, mock/e2e runs, and unknown durations.
native.onImportProgress((event) => {
  if (!stillActive(event.id)) return;
  stopProgress(event.id);
  if (event.percent == null) return;
  useVideoStore.getState().setImportState(event.id, {
    status: "transcoding",
    progress: event.percent,
  });
});
