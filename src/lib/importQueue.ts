import { classifyImportError } from "./importError";
import { isImportPending, isReusableAudioCache, normalizeImportStatus } from "./importStatus";
import { native } from "./native";
import { extractVideoId, isVideoUrl, normalizeVideoUrl } from "./parser";
import { formatSidecarGuidance } from "./sidecarError";
import { useVideoStore } from "@/store/videoStore";
import type { ImportResult, ImportStatus } from "@/types";

const STAGE_SPAN: Record<"resolving" | "transcoding", { start: number; end: number; ms: number }> = {
  resolving: { start: 0, end: 25, ms: 8000 },
  transcoding: { start: 25, end: 90, ms: 30000 },
};

const pendingIds: string[] = [];
const cancelled = new Set<string>();
let pumping = false;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let failHandler: ((title: string, detail: string) => void) | null = null;

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
}

export function resetImportQueue(): void {
  pendingIds.length = 0;
  cancelled.clear();
  pumping = false;
  stopProgress();
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

export function retryImport(id: string): void {
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
}

function stillActive(id: string): boolean {
  return !cancelled.has(id) && useVideoStore.getState().has(id);
}

function stopProgress(): void {
  if (progressTimer !== null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function startProgress(id: string, stage: "resolving" | "transcoding"): void {
  stopProgress();
  const { start, end, ms } = STAGE_SPAN[stage];
  const begun = Date.now();
  progressTimer = setInterval(() => {
    if (!stillActive(id)) {
      stopProgress();
      return;
    }
    const ratio = Math.min(1, (Date.now() - begun) / ms);
    useVideoStore.getState().setImportState(id, {
      status: stage,
      progress: Math.round(start + (end - start) * ratio),
    });
  }, 200);
}

function failItem(id: string, status: ImportStatus, detail: string): void {
  stopProgress();
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
  if (!stillActive(id)) return;
  const store = useVideoStore.getState();
  const item = store.items.find((entry) => entry.id === id);
  if (!item) return;

  let workingId = id;
  store.setImportState(workingId, { status: "resolving", progress: 0 });
  startProgress(workingId, "resolving");

  try {
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

    const path = await native.downloadAudio(workingId, meta.url);
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
    stopProgress();
  }
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (pendingIds.length > 0) {
      const id = pendingIds.shift();
      if (!id || cancelled.has(id)) {
        if (id) cancelled.delete(id);
        continue;
      }
      await runJob(id);
    }
  } finally {
    pumping = false;
    if (pendingIds.length > 0) void pump();
  }
}
