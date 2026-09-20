/** User-facing copy when yt-dlp / ffmpeg sidecars are not on disk. */
export const SIDECAR_GUIDANCE =
  "缺少 yt-dlp 或 ffmpeg 运行组件，请先运行 `bash scripts/fetch-binaries.sh` 后再导入或播放。";

const MISSING_SIDECAR_RE =
  /无法启动 sidecar|fetch-binaries|no such file or directory|os error 2|the system cannot find|program not found|sidecar not found|cannot find the path|cannot find the file/i;

function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(err);
}

/** Drop trailing `（native junk）` / `(native junk)` so toasts stay Chinese. */
function stripOpaqueSuffix(text: string): string {
  return text.replace(/（[^）]*）\s*$/g, "").replace(/\([^)]*\)\s*$/g, "").trim();
}

/**
 * If `err` looks like a missing sidecar (including opaque Tauri/OS text),
 * return Chinese guidance that names `scripts/fetch-binaries.sh`.
 * Otherwise null so the caller keeps its own copy.
 */
export function formatSidecarGuidance(err: unknown): string | null {
  const text = errorText(err);
  const stripped = stripOpaqueSuffix(text);
  // Already-Chinese download/transcode copy is not a missing sidecar (ffmpeg may
  // mention "No such file" for a bad input). Only rewrite sidecar/spawn text.
  if (/[\u4e00-\u9fff]/.test(stripped) && !/无法启动 sidecar|fetch-binaries/.test(stripped)) {
    return null;
  }
  if (!MISSING_SIDECAR_RE.test(text)) return null;
  if (/[\u4e00-\u9fff]/.test(stripped) && stripped.includes("fetch-binaries")) {
    return stripped;
  }
  return SIDECAR_GUIDANCE;
}
