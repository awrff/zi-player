import { formatSidecarGuidance } from "./sidecarError";
import type { ImportResult } from "@/types";

/** Distinguishable Chinese copy for resolve/import failures. */
export const IMPORT_ERROR_COPY = {
  network: "网络异常，无法解析该视频，请检查网络后重试",
  unavailable: "无法获取该视频信息，链接可能无效或视频不可用",
  access: "无法访问该视频，可能需要登录或被风控限制，请稍后重试",
  parseFailed: "视频信息解析失败，请检查链接后重试",
  resolveFailed: "解析视频失败，请检查链接后重试",
} as const;

const NETWORK_RE =
  /timed?\s*out|timeout|network is unreachable|connection (refused|reset|aborted)|econnreset|econnrefused|enotfound|name or service not known|temporary failure in name resolution|no route to host|failed to fetch|networkerror|offline|getaddrinfo|socket hang up|urlopen error/i;

const PARSE_RE = /expected value|invalid (json|type)|eof while parsing|syntax error|serde|unable to extract/i;

const ACCESS_RE = /http error\s*(403|412)|precondition failed|forbidden|风控|需要登录/i;

const UNAVAILABLE_RE =
  /http error\s*(404|410)|unsupported url|video unavailable|has been deleted|not a valid url|private video|稿件不可见|已删除|视频不存在/i;

function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(err);
}

export type ClassifiedImportError = {
  reason: "network" | "unavailable" | "access" | "parse-failed" | "resolve-failed";
  detail: string;
};

/** Map a host/yt-dlp/Tauri rejection to a typed Chinese import failure.
 * ponytail: regex over host text; ceiling is unusual yt-dlp wording.
 * Upgrade: structured error codes from `resolve_video`. */
export function classifyImportError(err: unknown): ClassifiedImportError {
  const sidecar = formatSidecarGuidance(err);
  if (sidecar) return { reason: "resolve-failed", detail: sidecar };

  const text = errorText(err);
  if (NETWORK_RE.test(text)) return { reason: "network", detail: IMPORT_ERROR_COPY.network };
  if (ACCESS_RE.test(text)) return { reason: "access", detail: IMPORT_ERROR_COPY.access };
  if (PARSE_RE.test(text)) return { reason: "parse-failed", detail: IMPORT_ERROR_COPY.parseFailed };
  if (UNAVAILABLE_RE.test(text)) return { reason: "unavailable", detail: IMPORT_ERROR_COPY.unavailable };
  // Only pass through our own Chinese copy, not a mixed yt-dlp dump.
  if (/[\u4e00-\u9fff]/.test(text) && !/ERROR:|WARNING:|Traceback/i.test(text)) {
    return { reason: "resolve-failed", detail: text };
  }
  return { reason: "resolve-failed", detail: IMPORT_ERROR_COPY.resolveFailed };
}

/**
 * Toast copy for a failed import. Reuses Ant Design `message.error` like #4/#5:
 * prefer typed `detail`, then reason-specific Chinese fallbacks.
 */
export function importErrorMessage(
  result: Extract<ImportResult, { ok: false }>,
  source: "modal" | "clipboard" = "modal",
): string {
  if (result.detail) return result.detail;
  switch (result.reason) {
    case "not-a-url":
      return source === "clipboard" ? "剪贴板内容不是有效链接" : "请输入 B 站视频链接";
    case "unsupported-url":
      return source === "clipboard"
        ? "剪贴板内容不是 B 站视频链接"
        : "请输入有效的 B 站视频链接（BV / av / b23.tv）";
    case "duplicate":
      return "该视频已在看板上，无需重复添加";
    case "network":
      return IMPORT_ERROR_COPY.network;
    case "unavailable":
      return IMPORT_ERROR_COPY.unavailable;
    case "access":
      return IMPORT_ERROR_COPY.access;
    case "parse-failed":
      return IMPORT_ERROR_COPY.parseFailed;
    case "resolve-failed":
      return IMPORT_ERROR_COPY.resolveFailed;
  }
}
