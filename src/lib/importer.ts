import { native } from "./native";
import { extractVideoId, isVideoUrl, normalizeVideoUrl } from "./parser";
import { classifyImportError } from "./importError";
import { useVideoStore } from "@/store/videoStore";
import type { ImportResult } from "@/types";

/**
 * Resolve + add a video URL. Shared by the add dialog and the
 * clipboard-import prompt so both behave identically.
 */
export async function importVideo(rawUrl: string): Promise<ImportResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, reason: "not-a-url" };
  if (!isVideoUrl(trimmed)) return { ok: false, reason: "unsupported-url" };

  const id = extractVideoId(trimmed);
  if (id && useVideoStore.getState().has(id)) {
    return { ok: false, reason: "duplicate" };
  }

  try {
    let meta = await native.resolveVideo(normalizeVideoUrl(trimmed)!);
    // Cache the cover locally so it survives the source CDN Referer check (the remote
    // image CDN 403s plain <img> requests). Failures keep the remote URL as a fallback.
    try {
      const cover = await native.fetchCover(meta.id, meta.url);
      if (cover) meta = { ...meta, cover };
    } catch {
      // ignore: keep the remote cover URL
    }
    const item = useVideoStore.getState().addVideo(meta);
    if (!item) return { ok: false, reason: "duplicate" };
    return { ok: true, item };
  } catch (err) {
    return { ok: false, ...classifyImportError(err) };
  }
}
