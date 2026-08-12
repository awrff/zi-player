import { native } from "./native";
import { extractBiliId, isBilibiliUrl, normalizeBiliUrl } from "./parser";
import { useVideoStore } from "@/store/videoStore";
import type { ImportResult } from "@/types";

/**
 * Resolve + add a Bilibili video URL. Shared by the add dialog and the
 * clipboard-import prompt so both behave identically.
 */
export async function importVideo(rawUrl: string): Promise<ImportResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { ok: false, reason: "not-a-url" };
  if (!isBilibiliUrl(trimmed)) return { ok: false, reason: "not-bilibili" };

  const id = extractBiliId(trimmed);
  if (id && useVideoStore.getState().has(id)) {
    return { ok: false, reason: "duplicate" };
  }

  try {
    const meta = await native.resolveVideo(normalizeBiliUrl(trimmed)!);
    const item = useVideoStore.getState().addVideo(meta);
    if (!item) return { ok: false, reason: "duplicate" };
    return { ok: true, item };
  } catch {
    return { ok: false, reason: "resolve-failed" };
  }
}
