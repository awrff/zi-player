/**
 * Video URL parsing and validation.
 *
 * Supported forms:
 *  - https://www.bilibili.com/video/BV1xx411c7mD
 *  - https://www.bilibili.com/video/av170001
 *  - https://b23.tv/AbCdEf (short link)
 *  - with query strings / trailing junk: ?p=2&t=30, etc.
 */

const VIDEO_HOST = /(^|\.)bilibili\.com$/i;

/** Matches host/video/BV... or host/video/av... */
const VIDEO_PATH_RE = /^\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i;

/** Matches a b23.tv short link. */
const SHORT_LINK_RE = /^\/[0-9A-Za-z]+$/;

export interface ParsedVideo {
  /** Canonical id: "BV1xx..." or "av123". */
  id: string;
  /** Canonical webpage URL. */
  url: string;
}

/** Normalize a URL object + return the video id if it is a supported video page. */
function parseVideoUrl(raw: string): ParsedVideo | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  // b23.tv short link -> redirect to the video page.
  if (url.hostname.toLowerCase() === "b23.tv" && SHORT_LINK_RE.test(url.pathname)) {
    return { id: url.pathname.slice(1), url: `https://b23.tv${url.pathname}` };
  }

  if (!VIDEO_HOST.test(url.hostname)) {
    return null;
  }

  const match = url.pathname.match(VIDEO_PATH_RE);
  if (!match) {
    return null;
  }

  const id = match[1];
  const canonical = `https://www.bilibili.com/video/${id}`;
  return { id, url: canonical };
}

/** True when the given text looks like any http(s) URL at all. */
export function looksLikeUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** True when the text is a supported video URL (video page or b23.tv short link). */
export function isVideoUrl(text: string): boolean {
  return parseVideoUrl(text) !== null;
}

/** Extract the canonical video id (e.g. "BV1xx411c7mD") or null. */
export function extractVideoId(text: string): string | null {
  return parseVideoUrl(text)?.id ?? null;
}

/** Extract a normalized video URL, or null when not recognized. */
export function normalizeVideoUrl(text: string): string | null {
  return parseVideoUrl(text)?.url ?? null;
}

/** Find the first supported video URL embedded anywhere in a block of text. */
export function findVideoUrlInText(text: string): string | null {
  const candidate = text.match(/https?:\/\/[^\s"'<>，。！？【】（）]+/gi);
  if (!candidate) return null;

  for (const raw of candidate) {
    const cleaned = raw.replace(/[),.;:!?]+$/, "");
    if (isVideoUrl(cleaned)) {
      return normalizeVideoUrl(cleaned);
    }
  }
  return null;
}
