import type { ImportStatus, VideoItem } from "@/types";

export function isReusableAudioCache(path: string | undefined): boolean {
  if (!path) return false;
  if (/^(asset|blob|https?):/i.test(path)) return false;
  if (/^data:audio\//i.test(path)) return true;
  return /\.ogg$/i.test(path);
}

export function normalizeImportStatus(item: VideoItem): ImportStatus {
  if (item.importStatus === "failed") return "failed";
  if (isReusableAudioCache(item.cachePath)) return "ready";
  if (item.importStatus === "ready") return "ready";
  if (item.importStatus === "resolving" || item.importStatus === "transcoding" || item.importStatus === "queued") {
    return item.importStatus;
  }
  return "queued";
}

export function isPlayable(item: VideoItem): boolean {
  return normalizeImportStatus(item) === "ready" && isReusableAudioCache(item.cachePath);
}

export function isImportPending(status: ImportStatus): boolean {
  return status === "queued" || status === "resolving" || status === "transcoding";
}

export function durableImportStatus(item: VideoItem): ImportStatus | undefined {
  if (item.importStatus === "failed") return "failed";
  if (item.importStatus === "ready" || isReusableAudioCache(item.cachePath)) return "ready";
  if (item.importStatus) return "queued";
  return undefined;
}

export function importStatusLabel(status: ImportStatus): string {
  if (status === "queued") return "等待中…";
  if (status === "resolving") return "解析信息…";
  if (status === "transcoding") return "下载转码…";
  if (status === "failed") return "导入失败";
  return "已缓存";
}
